import threading
from typing import Optional, Dict, Any

from utils.logger import get_logger
from config.manager import ConfigManager
from audio.manager import AudioManager
from providers.stt_factory import STTFactory
from agent.supervisor import SupervisorAgent

logger = get_logger()

class TruHandsFreeEngine:
    """
    The orchestrator. Manages the lifecycle between recording, transcribing,
    and agent processing.
    
    Supports two modes:
      - 'dictation': STT only → raw transcript
      - 'smart_transform': STT → LLM agent → processed text
    
    Pasting is now handled by the Electron frontend, which polls for 
    `pending_paste_text` to avoid macOS child process TCC blocks.
    """
    
    def __init__(self):
        self.config_manager = ConfigManager()
        self.audio_manager = AudioManager()
        
        # Load active config
        config = self.config_manager.get_config()
        self.stt_client = STTFactory.get_client(config.stt.provider)
        
        self.agent = SupervisorAgent(
            provider=config.llm.provider,
            model=config.llm.model,
            temperature=config.llm.temperature
        )
        
        self._is_processing = False
        self._active_mode: Optional[str] = None  # 'dictation' or 'smart_transform'
        self.last_error: Optional[str] = None  # Tracks pipeline errors for the UI toast
        self.pending_paste_text: Optional[str] = None # Text ready for Electron to paste

        logger.info(f"[Engine] Initialized — STT: {config.stt.provider}/{config.stt.model}, LLM: {config.llm.provider}/{config.llm.model}")

    @property
    def is_recording(self) -> bool:
        return self.audio_manager.is_recording

    @property
    def is_processing(self) -> bool:
        return self._is_processing

    @property
    def active_mode(self) -> Optional[str]:
        return self._active_mode

    def trigger_recording(self, mode: str = "dictation"):
        """Starts the microphone. mode = 'dictation' or 'smart_transform'."""
        if self._is_processing:
            logger.warning("[Engine] Currently processing — ignoring new recording request.")
            return
        if self.is_recording:
            logger.warning("[Engine] Already recording — ignoring duplicate trigger.")
            return
        
        self.last_error = None
        self.pending_paste_text = None
        
        self._active_mode = mode
        logger.info(f"[Engine] ▶ Starting recording — Mode: {mode.upper()}")
        
        config = self.config_manager.get_config()
        self.audio_manager.start_recording(device_name=config.audio.input_device)

    def stop_and_process(self):
        """Stops the mic and routes audio through the appropriate pipeline."""
        if self._is_processing:
            logger.warning("[Engine] Already processing — ignoring.")
            return
        if not self.is_recording:
            logger.warning("[Engine] Not recording — nothing to stop.")
            return
            
        self._is_processing = True
        mode = self._active_mode or "dictation"
        logger.info(f"[Engine] ■ Stopping recording — processing in {mode.upper()} mode...")

        # 1. Stop Audio
        wav_path = self.audio_manager.stop_recording()
        if not wav_path:
            logger.error("[Engine] ✗ No audio was captured.")
            self._is_processing = False
            self._active_mode = None
            return

        # Fire pipeline in background thread so we don't block
        threading.Thread(target=self._pipeline_task, args=(wav_path, mode), daemon=True).start()

    def _pipeline_task(self, wav_path: str, mode: str):
        import time
        pipeline_start = time.time()
        try:
            # 2. Transcribe via STT
            config = self.config_manager.get_config()
            logger.info(f"[Engine] Transcribing via {config.stt.provider}/{config.stt.model}...")
            transcript = self.stt_client.transcribe(
                wav_path,
                model=config.stt.model,
                language=config.stt.language
            )

            if not transcript:
                logger.error("[Engine] ✗ Transcription returned empty result.")
                self.last_error = "Transcription failed: Empty result."
                return

            logger.info(f"[Engine] ✓ Transcript: '{transcript}'")

            # 3. Mode-specific processing
            if mode == "dictation":
                # Pure dictation — paste raw transcript, no LLM
                logger.info("[Engine] Mode=DICTATION — storing raw transcript for pasting.")
                final_text = transcript
            else:
                # Smart transform — pass through LLM agent
                skill_id = config.hotkeys.default_skill_id
                logger.info(f"[Engine] Mode=SMART_TRANSFORM — sending to LLM Agent (skill: {skill_id})...")
                # We don't have OS context anymore, so pass an empty dict
                final_text = self.agent.process_transcript(
                    transcript, 
                    {}, 
                    skill_id
                )

                if not final_text:
                    logger.error("[Engine] ✗ Agent returned empty result. Falling back to raw transcript.")
                    self.last_error = "Agent processing failed (returned empty string). Fell back to raw dictation."
                    final_text = transcript

                logger.info(f"[Engine] ✓ Agent output: '{final_text}'")

            # 4. Handoff to Electron
            # Store it so the frontend's 1-second /status poll will pick it up
            self.pending_paste_text = final_text
            logger.info(f"[Engine] ✓ Text ready for Electron to paste ({len(final_text)} chars).")

        except Exception as e:
            logger.error(f"[Engine] ✗ Pipeline error: {e}", exc_info=True)
            self.last_error = f"Pipeline Error: {str(e)}"
        finally:
            elapsed = time.time() - pipeline_start
            self._is_processing = False
            self._active_mode = None
            logger.info(f"[Engine] ✓ Pipeline complete in {elapsed:.2f}s. Ready for next request.")

    def shutdown(self):
        """Cleanly releases audio hardware and resources before destroying the engine."""
        logger.info("[Engine] Shutting down orchestrator...")
        try:
            if self.is_recording:
                self.audio_manager.stop_recording()
        except Exception as e:
            logger.error(f"[Engine] Error during shutdown: {e}")
