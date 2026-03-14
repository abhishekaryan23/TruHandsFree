import argparse
import base64
import logging
import os
import tempfile
import threading
from pathlib import Path
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from agent.skills.manager import SkillManager
from config.manager import ConfigManager
from engine import TruHandsFreeEngine
from providers.model_discovery import ModelDiscovery
from security.secrets_manager import SecretsManager
from utils.logger import get_logger

logger = get_logger()

LOCAL_UI_ORIGINS = ["null", "file://"]
LOCAL_UI_ORIGIN_REGEX = r"^https?://(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$"

app = FastAPI(title="TruHandsFree Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=LOCAL_UI_ORIGINS,
    allow_origin_regex=LOCAL_UI_ORIGIN_REGEX,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

config_manager = ConfigManager()
skill_manager = SkillManager()
engine = TruHandsFreeEngine()


class APIKeyPayload(BaseModel):
    provider: str
    key: str


class SmartContextPayload(BaseModel):
    app_name: str = "Unknown"
    bundle_id: Optional[str] = None
    window_title: Optional[str] = None
    page_title: Optional[str] = None
    url_host: Optional[str] = None


class CaptureStatsPayload(BaseModel):
    duration_ms: int = 0
    peak: float = 0.0
    rms: float = 0.0
    used_device_id: Optional[str] = None
    used_device_label: Optional[str] = None
    fallback_to_default: bool = False
    fallback_notice: Optional[str] = None


class ProcessAudioPayload(BaseModel):
    audio_base64: str
    mode: str = "dictation"
    context: Optional[SmartContextPayload] = None
    context_warning: Optional[str] = None
    capture_stats: Optional[CaptureStatsPayload] = None


class TestAudioPayload(BaseModel):
    audio_base64: str
    capture_stats: Optional[CaptureStatsPayload] = None


def _temporary_audio_dir() -> Path:
    directory = Path.home() / ".truhandsfree" / "temp"
    directory.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(directory, 0o700)
    except OSError:
        pass
    return directory


def _write_uploaded_wav(audio_base64: str) -> str:
    try:
        audio_bytes = base64.b64decode(audio_base64, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid audio payload: {exc}") from exc

    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Uploaded audio was empty.")

    with tempfile.NamedTemporaryFile(
        suffix=".wav",
        prefix="capture_",
        dir=_temporary_audio_dir(),
        delete=False,
    ) as handle:
        handle.write(audio_bytes)
        temp_path = Path(handle.name)

    try:
        os.chmod(temp_path, 0o600)
    except OSError:
        pass

    return str(temp_path)


@app.on_event("startup")
def startup_event():
    logger.info("FastAPI Server starting up...")

    def _watch_parent():
        import time

        while True:
            try:
                if os.getppid() == 1:
                    logger.warning("Parent Electron process died unexpectedly. Auto-terminating backend.")
                    os._exit(0)
            except AttributeError:
                pass
            time.sleep(2)

    threading.Thread(target=_watch_parent, daemon=True, name="ParentWatcher").start()


@app.on_event("shutdown")
def shutdown_event():
    logger.info("FastAPI Server shutting down...")


@app.get("/health")
def health_check():
    return {"status": "ok", "message": "TruHandsFree is running"}


@app.get("/config")
def get_config():
    return config_manager.get_config().model_dump()


@app.post("/config")
def update_config(updates: dict):
    updated_config = config_manager.update_config(updates)
    if not updated_config:
        raise HTTPException(status_code=400, detail="Failed to update configuration.")

    global engine
    engine.shutdown()
    engine = TruHandsFreeEngine()
    return {"status": "success", "config": updated_config.model_dump()}


@app.post("/secrets")
def update_secret(payload: APIKeyPayload):
    logger.info("Updating API Key for provider: %s", payload.provider)
    if not SecretsManager.set_api_key(payload.provider, payload.key):
        raise HTTPException(status_code=500, detail="Failed to save API key.")
    return {"status": "success", "message": f"API key for {payload.provider} saved securely."}


@app.get("/secrets/check")
def check_secrets():
    providers = ["groq", "openai", "anthropic", "deepgram"]
    result = {}
    for provider in providers:
        key = SecretsManager.get_api_key(provider)
        result[provider] = bool(key and len(key) > 0)
    return result


@app.get("/status")
def get_status():
    config = config_manager.get_config()
    stt_key = SecretsManager.get_api_key(config.stt.provider) if config.stt.provider != "local" else True
    llm_key = SecretsManager.get_api_key(config.llm.provider) if config.llm.provider != "local" else True

    return {
        "backend_ready": True,
        "is_recording": False,
        "is_processing": engine.is_processing,
        "active_mode": engine.active_mode,
        "active_skill": config.hotkeys.default_skill_id,
        "audio_amplitude": 0.0,
        "last_error": engine.last_error,
        "pending_paste_text": engine.pending_paste_text,
        "missing_api_keys": not (stt_key and llm_key),
        "phase": engine.phase,
        "phase_label": engine.phase_label,
        "captured_context": engine.captured_context,
        "captured_context_at": engine.captured_context_at,
        "captured_context_quality": engine.captured_context_quality,
        "target_type": engine.target_type,
        "context_warning": engine.context_warning,
    }


@app.post("/status/clear_paste")
def clear_paste():
    engine.clear_pending_paste()
    return {"status": "cleared"}


@app.post("/recording/process")
def process_recording(payload: ProcessAudioPayload):
    if engine.is_processing:
        raise HTTPException(status_code=409, detail="The local engine is still processing the previous recording.")

    wav_path = _write_uploaded_wav(payload.audio_base64)
    capture_stats = payload.capture_stats.model_dump() if payload.capture_stats else {}
    logger.info(
        "[API] Uploaded recording accepted — mode=%s device=%r duration_ms=%s peak=%.4f rms=%.6f fallback=%s",
        payload.mode,
        capture_stats.get("used_device_label"),
        capture_stats.get("duration_ms"),
        capture_stats.get("peak", 0.0),
        capture_stats.get("rms", 0.0),
        capture_stats.get("fallback_to_default", False),
    )

    try:
        engine.start_processing(
            wav_path=wav_path,
            mode=payload.mode,
            context=payload.context.model_dump() if payload.context else None,
            context_warning=payload.context_warning,
        )
    except RuntimeError as exc:
        Path(wav_path).unlink(missing_ok=True)
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    return {"status": "accepted", "message": f"Started {payload.mode} processing"}


@app.post("/audio/test/process")
def process_audio_test(payload: TestAudioPayload):
    if engine.is_processing:
        raise HTTPException(status_code=409, detail="The local engine is busy. Finish the current request before running a mic test.")

    wav_path = _write_uploaded_wav(payload.audio_base64)
    capture_stats = payload.capture_stats.model_dump() if payload.capture_stats else {}
    logger.info(
        "[API] Uploaded mic test accepted — device=%r duration_ms=%s peak=%.4f rms=%.6f fallback=%s",
        capture_stats.get("used_device_label"),
        capture_stats.get("duration_ms"),
        capture_stats.get("peak", 0.0),
        capture_stats.get("rms", 0.0),
        capture_stats.get("fallback_to_default", False),
    )
    return engine.process_test_audio(wav_path)


@app.get("/providers/models")
def get_provider_models():
    return ModelDiscovery.get_all_models()


@app.get("/skills")
def get_skills():
    return {"skills": skill_manager.get_all_skills()}


@app.post("/skills")
def add_skill(skill: dict):
    if "id" not in skill or "name" not in skill or "prompt" not in skill:
        raise HTTPException(status_code=400, detail="Skill missing required fields (id, name, prompt).")

    success = skill_manager.add_custom_skill(skill)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to add skill (cannot overwrite system skills).")
    return {"status": "success", "message": "Skill added successfully"}


@app.delete("/skills/{skill_id}")
def delete_skill(skill_id: str):
    if skill_id.startswith("system_"):
        raise HTTPException(status_code=400, detail="Cannot delete system skills.")

    success = skill_manager.delete_custom_skill(skill_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_id}' not found.")
    return {"status": "success", "message": f"Skill '{skill_id}' deleted."}


class EndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return record.getMessage().find("GET /status") == -1


def resolve_server_port(default: int = 8055) -> int:
    raw_value = os.environ.get("TRUHANDSFREE_BACKEND_PORT")
    if raw_value:
        try:
            return int(raw_value)
        except ValueError:
            logger.warning("Invalid TRUHANDSFREE_BACKEND_PORT=%r. Falling back to %s.", raw_value, default)
    return default


def run_server(port: int = 8055):
    logging.getLogger("uvicorn.access").addFilter(EndpointFilter())
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the TruHandsFree local backend.")
    parser.add_argument("--port", type=int, default=resolve_server_port())
    args = parser.parse_args()
    run_server(port=args.port)
