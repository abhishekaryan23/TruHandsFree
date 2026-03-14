import os
import shutil
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

from agent.supervisor import SupervisorAgent
from config.manager import ConfigManager
from context_profile import derive_context_quality, derive_target_type, normalize_context
from providers.stt_factory import STTFactory
from utils.logger import get_logger

logger = get_logger()


class TruHandsFreeEngine:
    """
    Orchestrates uploaded-audio processing for Dictation and Smart Mode.

    Electron owns microphone permission and capture. The backend now only
    processes WAV files and exposes status for the floating widget / setup UI.
    """

    def __init__(self):
        self.config_manager = ConfigManager()

        config = self.config_manager.get_config()
        self.stt_client = STTFactory.get_client(config.stt.provider)
        self.agent = SupervisorAgent(
            provider=config.llm.provider,
            model=config.llm.model,
            temperature=config.llm.temperature,
        )

        self._is_processing = False
        self._phase = "ready"
        self._active_mode: Optional[str] = None
        self.last_error: Optional[str] = None
        self.pending_paste_text: Optional[str] = None
        self.context_warning: Optional[str] = None
        self.captured_context: Dict[str, Any] = normalize_context()
        self.captured_context_at: Optional[str] = None
        self.captured_context_quality: str = "empty"
        self.target_type: Optional[str] = None

        logger.info(
            "[Engine] Initialized — STT: %s/%s, LLM: %s/%s",
            config.stt.provider,
            config.stt.model,
            config.llm.provider,
            config.llm.model,
        )

    @property
    def is_recording(self) -> bool:
        return False

    @property
    def is_processing(self) -> bool:
        return self._is_processing

    @property
    def active_mode(self) -> Optional[str]:
        return self._active_mode

    @property
    def phase(self) -> str:
        return self._phase

    @property
    def phase_label(self) -> str:
        if self._phase == "transforming":
            app_name = self.captured_context.get("app_name") or "Unknown"
            url_host = self.captured_context.get("url_host")
            if url_host:
                return f"Transforming for {app_name} • {url_host}"
            if app_name and app_name != "Unknown":
                return f"Transforming for {app_name}"

        labels = {
            "booting_backend": "Booting backend",
            "ready": "Ready",
            "transcribing": "Transcribing speech",
            "transforming": "Transforming transcript",
            "preparing_paste": "Preparing paste",
            "error": "Attention needed",
        }
        return labels.get(self._phase, "Ready")

    def _set_phase(self, phase: str):
        self._phase = phase

    def _should_log_sensitive_transcripts(self) -> bool:
        config = self.config_manager.get_config()
        return bool(getattr(config, "debug", None) and config.debug.log_sensitive_transcripts)

    def _should_persist_recordings(self) -> bool:
        config = self.config_manager.get_config()
        return bool(getattr(config, "debug", None) and config.debug.persist_recordings)

    def _persist_debug_copy(self, wav_path: str) -> Optional[str]:
        if not self._should_persist_recordings():
            return None

        recordings_dir = Path.home() / ".truhandsfree" / "recordings"
        recordings_dir.mkdir(parents=True, exist_ok=True)
        try:
            os.chmod(recordings_dir, 0o700)
        except OSError:
            pass

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        destination = recordings_dir / f"recording_{timestamp}.wav"
        shutil.copy2(wav_path, destination)
        try:
            os.chmod(destination, 0o600)
        except OSError:
            pass
        logger.info("[Engine] ✓ Saved debug WAV: %s", destination)
        return str(destination)

    def _rewrite_transcript(self, transcript: str, skill_id: str) -> str:
        self._set_phase("transforming")
        logger.info("[Engine] Mode=SMART_TRANSFORM — sending to LLM Agent (skill: %s)...", skill_id)
        final_text = self.agent.process_transcript(
            transcript,
            {
                **self.captured_context,
                "context_quality": self.captured_context_quality,
                "target_type": self.target_type,
            },
            skill_id,
        )

        if not final_text:
            logger.error("[Engine] ✗ Agent returned empty result. Falling back to raw transcript.")
            self.last_error = "Agent processing failed (returned empty string). Fell back to raw dictation."
            return transcript

        if self._should_log_sensitive_transcripts():
            logger.info("[Engine] ✓ Agent output: %r", final_text)
        else:
            logger.info("[Engine] ✓ Agent output prepared (%d chars).", len(final_text))

        return final_text

    def _prepare_context(
        self,
        mode: str,
        context: Optional[Dict[str, Any]],
        context_warning: Optional[str],
    ):
        if mode == "smart_transform":
            self.context_warning = context_warning
            self.captured_context = normalize_context(context)
            self.captured_context_quality = derive_context_quality(self.captured_context, context_warning)
            self.target_type = derive_target_type(self.captured_context)
            self.captured_context_at = datetime.utcnow().isoformat(timespec="seconds") + "Z"
            logger.info(
                "[Engine] Smart context captured. app=%r bundle=%r window=%r host=%r quality=%s target_type=%s",
                self.captured_context.get("app_name"),
                self.captured_context.get("bundle_id"),
                self.captured_context.get("window_title"),
                self.captured_context.get("url_host"),
                self.captured_context_quality,
                self.target_type,
            )
        else:
            self.context_warning = None

    def start_processing(
        self,
        wav_path: str,
        mode: str = "dictation",
        context: Optional[Dict[str, Any]] = None,
        context_warning: Optional[str] = None,
    ):
        if self._is_processing:
            raise RuntimeError("The backend is already processing another recording.")

        normalized_mode = mode if mode in {"dictation", "smart_transform"} else "dictation"
        if normalized_mode != mode:
            logger.warning("[Engine] Unsupported processing mode %r. Falling back to dictation.", mode)

        self.last_error = None
        self.pending_paste_text = None
        self._active_mode = normalized_mode
        self._is_processing = True
        self._prepare_context(normalized_mode, context, context_warning)

        logger.info("[Engine] ▶ Starting uploaded-audio processing — Mode: %s", normalized_mode.upper())
        threading.Thread(target=self._pipeline_task, args=(wav_path, normalized_mode), daemon=True).start()

    def _pipeline_task(self, wav_path: str, mode: str):
        import time

        pipeline_start = time.time()
        try:
            config = self.config_manager.get_config()
            self._persist_debug_copy(wav_path)
            self._set_phase("transcribing")
            logger.info("[Engine] Transcribing via %s/%s...", config.stt.provider, config.stt.model)
            transcript = self.stt_client.transcribe(
                wav_path,
                model=config.stt.model,
                language=config.stt.language,
            )

            if not transcript:
                logger.error("[Engine] ✗ Transcription returned empty result.")
                self.last_error = "Transcription failed: Empty result."
                self._set_phase("error")
                return

            if self._should_log_sensitive_transcripts():
                logger.info("[Engine] ✓ Transcript: %r", transcript)
            else:
                logger.info("[Engine] ✓ Transcript ready (%d chars).", len(transcript))

            if mode == "dictation":
                logger.info("[Engine] Mode=DICTATION — storing raw transcript for pasting.")
                final_text = transcript
            else:
                final_text = self._rewrite_transcript(transcript, config.hotkeys.default_skill_id)

            if final_text:
                self._set_phase("preparing_paste")
                self.pending_paste_text = final_text
                logger.info("[Engine] ✓ Text ready for Electron to paste (%d chars).", len(final_text))

        except Exception as exc:
            logger.error("[Engine] ✗ Pipeline error: %s", exc, exc_info=True)
            self.last_error = f"Pipeline Error: {str(exc)}"
            self._set_phase("error")
        finally:
            try:
                if wav_path:
                    Path(wav_path).unlink(missing_ok=True)
            except Exception as exc:
                logger.warning("[Engine] Failed to clean up uploaded audio %s: %s", wav_path, exc)

            elapsed = time.time() - pipeline_start
            self._is_processing = False
            self._active_mode = None
            if self._phase not in {"preparing_paste", "error"}:
                self._set_phase("ready")
            logger.info("[Engine] ✓ Pipeline complete in %.2fs. Ready for next request.", elapsed)

    def process_test_audio(self, wav_path: str) -> dict[str, Any]:
        import time

        start_time = time.time()
        try:
            config = self.config_manager.get_config()
            debug_copy = self._persist_debug_copy(wav_path)
            logger.info("[Debug STT] Processing uploaded mic test via %s/%s", config.stt.provider, config.stt.model)
            transcript = self.stt_client.transcribe(
                wav_path,
                model=config.stt.model,
                language=config.stt.language,
            )
            if transcript:
                logger.info("[Debug STT] Transcript ready (%d chars).", len(transcript))
            return {
                "status": "success",
                "transcript": transcript or "",
                "audio_file": debug_copy,
                "processing_time": round(time.time() - start_time, 2),
            }
        finally:
            try:
                Path(wav_path).unlink(missing_ok=True)
            except Exception as exc:
                logger.warning("[Engine] Failed to clean up mic test audio %s: %s", wav_path, exc)

    def clear_pending_paste(self):
        self.pending_paste_text = None
        if not self._is_processing:
            self._set_phase("ready")

    def shutdown(self):
        logger.info("[Engine] Shutting down orchestrator...")
