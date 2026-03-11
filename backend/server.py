from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import threading

from config.manager import ConfigManager
from security.secrets_manager import SecretsManager
from agent.skills.manager import SkillManager
from providers.model_discovery import ModelDiscovery
from engine import TruHandsFreeEngine
from utils.logger import get_logger

logger = get_logger()

app = FastAPI(title="TruHandsFree Backend")

# Allow Electron renderer (any localhost origin) to access the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
config_manager = ConfigManager()
skill_manager = SkillManager()

# Global state
engine = TruHandsFreeEngine()

class APIKeyPayload(BaseModel):
    provider: str
    key: str

@app.on_event("startup")
def startup_event():
    logger.info("FastAPI Server starting up...")
    
    # Watcher thread to auto-terminate if parent Electron app dies unexpectedly
    def _watch_parent():
        import os, time
        while True:
            try:
                # If parent PID is 1 (launchd/init), the parent process has died
                if os.getppid() == 1:
                    logger.warning("Parent Electron process died unexpectedly. Auto-terminating backend.")
                    os._exit(0)
            except AttributeError:
                pass # getppid not supported on Windows
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
    if updated_config:
        global engine
        
        # Prevent PyAudio ghost threads accumulating by cleanly shutting down the old engine
        engine.shutdown()
        
        # Boot the new engine with the refreshed config
        engine = TruHandsFreeEngine()
        
        return {"status": "success", "config": updated_config.model_dump()}
    else:
        raise HTTPException(status_code=400, detail="Failed to update configuration.")

@app.post("/secrets")
def update_secret(payload: APIKeyPayload):
    logger.info(f"Updating API Key for provider: {payload.provider}")
    success = SecretsManager.set_api_key(payload.provider, payload.key)
    if success:
        return {"status": "success", "message": f"API key for {payload.provider} saved securely."}
    else:
        raise HTTPException(status_code=500, detail="Failed to save API key.")

@app.get("/secrets/check")
def check_secrets():
    """Returns which providers have API keys set (without revealing the actual keys)."""
    providers = ["groq", "openai", "anthropic", "deepgram"]
    result = {}
    for p in providers:
        key = SecretsManager.get_api_key(p)
        result[p] = bool(key and len(key) > 0)
    return result

@app.get("/status")
def get_status():
    """Returns the live state of the engine for the floating widget."""
    from security.secrets_manager import SecretsManager
    config = config_manager.get_config()
    
    # Check if we have the keys we need for the current providers
    stt_key = SecretsManager.get_api_key(config.stt.provider) if config.stt.provider != "local" else True
    llm_key = SecretsManager.get_api_key(config.llm.provider) if config.llm.provider != "local" else True

    return {
        "backend_ready": True,
        "is_recording": engine.is_recording,
        "is_processing": engine.is_processing,
        "active_mode": engine.active_mode,
        "active_skill": config.hotkeys.default_skill_id,
        "audio_amplitude": engine.audio_manager.current_amplitude if engine.is_recording else 0.0,
        "last_error": engine.last_error,
        "pending_paste_text": engine.pending_paste_text,
        "missing_api_keys": not (stt_key and llm_key)
    }

@app.post("/status/clear_paste")
def clear_paste():
    """Clears the pending text after the Electron UI has successfully copied it."""
    engine.pending_paste_text = None
    return {"status": "cleared"}

@app.post("/recording/toggle")
def toggle_recording(body: dict):
    """
    Toggle recording on/off via the widget buttons or Electron hotkeys.
    Body: { "mode": "dictation" | "smart_transform" }
    """
    mode = body.get("mode", "dictation")
    logger.info(f"[API] Toggle recording request — mode: {mode}, currently_recording: {engine.is_recording}")
    
    if engine.is_recording:
        engine.stop_and_process()
        return {"status": "stopped", "message": f"Stopped {mode} recording, processing..."}
    else:
        engine.trigger_recording(mode=mode)
        return {"status": "started", "message": f"Started {mode} recording"}

@app.get("/audio/devices")
def get_audio_devices(refresh: bool = False):
    """Returns a list of available input audio devices on the system."""
    from audio.manager import AudioManager
    # Only allow hardware rescan when not actively recording (would break the stream)
    safe_to_refresh = refresh and not engine.is_recording
    devices = AudioManager.get_input_devices(refresh=safe_to_refresh)
    return {"devices": devices}

@app.post("/audio/test/start")
def start_test_recording():
    """Starts a debug recording session."""
    config = config_manager.get_config()
    if engine.is_recording:
        logger.warning("Already recording.")
        return {"status": "recording_already_active"}
    
    logger.info("Starting TEST recording mode.")
    engine.audio_manager.start_recording(device_name=config.audio.input_device)
    return {"status": "success", "message": "Test recording started"}

@app.post("/audio/test/stop")
def stop_test_recording():
    """Stops the debug recording, transcribes the audio, and returns transcript."""
    import time
    if not engine.audio_manager.is_recording:
        return {"status": "error", "message": "Not recording."}
    
    logger.info("Stopping TEST recording mode.")
    
    # Measure time
    start_time = time.time()
    
    # Stop mic and get file
    wav_path = engine.audio_manager.stop_recording()
    if not wav_path:
        return {"status": "error", "message": "No audio captured."}
    
    # Transcribe directly
    config = config_manager.get_config()
    logger.info(f"Test transcriber using {config.stt.provider}/{config.stt.model}")
    
    transcript = engine.stt_client.transcribe(
        wav_path,
        model=config.stt.model,
        language=config.stt.language
    )
    
    end_time = time.time()
    duration = end_time - start_time
    
    return {
        "status": "success", 
        "transcript": transcript or "",
        "audio_file": wav_path,
        "processing_time": round(duration, 2)
    }

@app.get("/providers/models")
def get_provider_models():
    """Returns available models dynamically from provider APIs, with fallback defaults."""
    return ModelDiscovery.get_all_models()

@app.get("/skills")
def get_skills():
    return {"skills": skill_manager.get_all_skills()}

@app.post("/skills")
def add_skill(skill: dict):
    if "id" not in skill or "name" not in skill or "prompt" not in skill:
        raise HTTPException(status_code=400, detail="Skill missing required fields (id, name, prompt).")
    
    success = skill_manager.add_custom_skill(skill)
    if success:
        return {"status": "success", "message": "Skill added successfully"}
    else:
        raise HTTPException(status_code=400, detail="Failed to add skill (cannot overwrite system skills).")

@app.delete("/skills/{skill_id}")
def delete_skill(skill_id: str):
    """Deletes a custom skill by ID. System skills cannot be deleted."""
    if skill_id.startswith("system_"):
        raise HTTPException(status_code=400, detail="Cannot delete system skills.")
    
    success = skill_manager.delete_custom_skill(skill_id)
    if success:
        return {"status": "success", "message": f"Skill '{skill_id}' deleted."}
    else:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_id}' not found.")

import logging

class EndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        # Ignore GET /status from uvicorn access logs to prevent spam
        return record.getMessage().find("GET /status") == -1

def run_server(port: int = 8055):
    logging.getLogger("uvicorn.access").addFilter(EndpointFilter())
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")

if __name__ == "__main__":
    run_server()
