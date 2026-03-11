import requests
from typing import Optional
from security.secrets_manager import SecretsManager
from utils.logger import get_logger

logger = get_logger()

# All three providers expose an OpenAI-compatible /v1/audio/transcriptions endpoint.
# We use a single client with a configurable base_url instead of 3 separate implementations.
PROVIDER_BASE_URLS = {
    "groq": "https://api.groq.com/openai/v1",
    "openai": "https://api.openai.com/v1",
    "deepgram": "https://api.deepgram.com/v1",
}

class UnifiedSTTClient:
    """
    A single STT client that works with any OpenAI-compatible transcription endpoint.
    Groq, OpenAI, and Deepgram all expose /v1/audio/transcriptions.
    """

    def __init__(self, provider: str = "groq"):
        self.provider = provider.lower()
        self.base_url = PROVIDER_BASE_URLS.get(self.provider)
        if not self.base_url:
            raise ValueError(f"Unsupported STT provider: {self.provider}")

    def transcribe(self, audio_file_path: str, model: str = "whisper-large-v3", language: str = "en") -> Optional[str]:
        # Fetch API key fresh each call so keys saved via Settings UI are picked up
        api_key = SecretsManager.get_api_key(self.provider)
        if not api_key:
            logger.error(f"Cannot transcribe: {self.provider} API key is missing. Set it in Settings.")
            return None

        headers = {
            "Authorization": f"Bearer {api_key}"
        }

        try:
            with open(audio_file_path, "rb") as file:
                files = {
                    "file": (audio_file_path, file, "audio/wav")
                }
                data = {
                    "model": model,
                    "language": language,
                    "response_format": "json"
                }

                logger.debug(f"Sending audio to {self.provider} STT ({model}) at {self.base_url}...")
                response = requests.post(
                    f"{self.base_url}/audio/transcriptions",
                    headers=headers,
                    files=files,
                    data=data,
                    timeout=30
                )

                if response.status_code == 200:
                    result = response.json()
                    transcript = result.get('text', '').strip()
                    logger.info(f"Successfully transcribed audio with {self.provider}.")
                    return transcript
                else:
                    logger.error(f"{self.provider} STT Error: {response.status_code} - {response.text}")
                    return None

        except Exception as e:
            logger.error(f"Failed to transcribe audio via {self.provider}: {e}")
            return None


class STTFactory:
    """
    Returns the unified STT client configured for the requested provider.
    """
    @staticmethod
    def get_client(provider: str) -> UnifiedSTTClient:
        return UnifiedSTTClient(provider=provider)
