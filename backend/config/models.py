from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List

class STTConfig(BaseModel):
    provider: str = Field(default="groq", description="The default STT provider (e.g., groq, deepgram, openai, local)")
    model: str = Field(default="whisper-large-v3", description="The specific model used for STT")
    language: str = Field(default="en", description="Default language code")

class LLMConfig(BaseModel):
    provider: str = Field(default="groq", description="The default LLM provider (e.g., groq, anthropic, openai)")
    model: str = Field(default="llama3-70b-8192", description="The specific model used for the Supervisor Agent")
    temperature: float = Field(default=0.0, description="Temperature for generation (lower is generally better for reliable code/formatting)")

class HotkeyConfig(BaseModel):
    trigger_dictation: str = Field(default="<ctrl>+d", description="Hotkey for pure dictation (STT only)")
    trigger_smart_agent: str = Field(default="<ctrl>+t", description="Hotkey for smart transform (STT + LLM)")
    default_skill_id: str = Field(default="system_dictation", description="The default skill to use for smart transform")

class AudioConfig(BaseModel):
    input_device: Optional[str] = Field(default=None, description="The specific microphone device name to use. None = system default.")

class AppConfig(BaseModel):
    stt: STTConfig = Field(default_factory=STTConfig)
    llm: LLMConfig = Field(default_factory=LLMConfig)
    hotkeys: HotkeyConfig = Field(default_factory=HotkeyConfig)
    audio: AudioConfig = Field(default_factory=AudioConfig)
    
    # We explicitly EXCLUDE api_keys from the Pydantic model representation 
    # that gets saved to disk. These are managed statically by SecretsManager.
