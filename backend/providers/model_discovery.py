import requests
import time
from typing import Dict, List, Optional
from security.secrets_manager import SecretsManager
from utils.logger import get_logger

logger = get_logger()

# Provider API base URLs for model listing
PROVIDER_ENDPOINTS = {
    "groq": "https://api.groq.com/openai/v1/models",
    "openai": "https://api.openai.com/v1/models",
    "anthropic": "https://api.anthropic.com/v1/models",
}

# Sensible defaults when API key is missing or API call fails
DEFAULT_MODELS = {
    "llm": {
        "groq": [
            {"id": "llama-3.3-70b-versatile", "name": "Llama 3.3 70B"},
            {"id": "llama-3.1-8b-instant", "name": "Llama 3.1 8B"},
            {"id": "qwen/qwen3-32b", "name": "Qwen3 32B"},
        ],
        "openai": [
            {"id": "gpt-4o", "name": "GPT-4o"},
            {"id": "gpt-4o-mini", "name": "GPT-4o Mini"},
            {"id": "gpt-3.5-turbo", "name": "GPT-3.5 Turbo"},
        ],
        "anthropic": [
            {"id": "claude-sonnet-4-20250514", "name": "Claude Sonnet 4"},
            {"id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet"},
            {"id": "claude-3-haiku-20240307", "name": "Claude 3 Haiku"},
        ]
    },
    "stt": {
        "groq": [
            {"id": "whisper-large-v3", "name": "Whisper Large v3"},
            {"id": "whisper-large-v3-turbo", "name": "Whisper Large v3 Turbo"},
        ],
        "openai": [
            {"id": "whisper-1", "name": "Whisper 1"},
        ],
        "deepgram": [
            {"id": "nova-2", "name": "Nova 2"},
        ]
    }
}

# Known STT model prefixes
STT_MODEL_PREFIXES = ("whisper", "nova", "distil-whisper")

# Non-chat model patterns to filter out (guard models, TTS, embeddings, etc.)
NON_CHAT_PATTERNS = (
    "guard",           # llama-guard, prompt-guard
    "safeguard",       # gpt-oss-safeguard
    "orpheus",         # TTS models (canopylabs/orpheus)
    "embed",           # embedding models
    "moderation",      # moderation models
)

# Cache: { provider: { "models": [...], "timestamp": float } }
_cache: Dict[str, dict] = {}
CACHE_TTL = 300  # 5 minutes


class ModelDiscovery:
    """
    Queries provider APIs for available models with caching.
    Falls back to hardcoded defaults if API key is missing or request fails.
    """

    @staticmethod
    def _fetch_models_from_api(provider: str, api_key: str) -> Optional[List[dict]]:
        """Fetch raw model list from the provider's /v1/models endpoint."""
        endpoint = PROVIDER_ENDPOINTS.get(provider)
        if not endpoint:
            return None

        headers = {"Authorization": f"Bearer {api_key}"}

        # Anthropic uses a different header format
        if provider == "anthropic":
            headers = {
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01"
            }

        try:
            response = requests.get(endpoint, headers=headers, timeout=10)
            if response.status_code == 200:
                data = response.json()
                models = data.get("data", [])
                return models
            else:
                logger.warning(f"Model discovery API returned {response.status_code} for {provider}")
                return None
        except Exception as e:
            logger.warning(f"Failed to fetch models from {provider}: {e}")
            return None

    @staticmethod
    def _format_model(model: dict) -> dict:
        """Normalize a raw API model object into our format."""
        model_id = model.get("id", "")
        # Create clean human-readable name
        name = model_id.split("/")[-1] if "/" in model_id else model_id
        name = name.replace("-", " ").replace("_", " ").title()
        return {"id": model_id, "name": name}

    @staticmethod
    def _is_stt_model(model_id: str) -> bool:
        return any(model_id.lower().startswith(p) for p in STT_MODEL_PREFIXES)

    @staticmethod
    def _is_chat_model(model_id: str) -> bool:
        """Check if this looks like a usable chat/completion model (not guard, TTS, etc.)."""
        lower_id = model_id.lower()
        return not any(p in lower_id for p in NON_CHAT_PATTERNS)

    @staticmethod
    def list_models(provider: str) -> Dict[str, List[dict]]:
        """
        Returns {"llm": [...], "stt": [...]} for the given provider.
        Uses caching (5 min TTL). Falls back to defaults.
        """
        provider = provider.lower()
        now = time.time()

        # Check cache
        if provider in _cache and (now - _cache[provider]["timestamp"]) < CACHE_TTL:
            return _cache[provider]["models"]

        api_key = SecretsManager.get_api_key(provider)
        if not api_key:
            logger.info(f"No API key for {provider}, returning default models.")
            return {
                "llm": DEFAULT_MODELS["llm"].get(provider, []),
                "stt": DEFAULT_MODELS["stt"].get(provider, [])
            }

        raw_models = ModelDiscovery._fetch_models_from_api(provider, api_key)

        if raw_models is None:
            return {
                "llm": DEFAULT_MODELS["llm"].get(provider, []),
                "stt": DEFAULT_MODELS["stt"].get(provider, [])
            }

        # Split into LLM and STT, filtering out non-chat models
        llm_models = []
        stt_models = []
        for m in raw_models:
            model_id = m.get("id", "")
            formatted = ModelDiscovery._format_model(m)
            if ModelDiscovery._is_stt_model(model_id):
                stt_models.append(formatted)
            elif ModelDiscovery._is_chat_model(model_id):
                llm_models.append(formatted)

        result = {
            "llm": llm_models if llm_models else DEFAULT_MODELS["llm"].get(provider, []),
            "stt": stt_models if stt_models else DEFAULT_MODELS["stt"].get(provider, [])
        }

        # Cache the result
        _cache[provider] = {"models": result, "timestamp": now}
        return result

    @staticmethod
    def get_all_models() -> Dict[str, Dict[str, List[dict]]]:
        """Returns models for all known providers."""
        all_llm = {}
        all_stt = {}
        for provider in set(list(PROVIDER_ENDPOINTS.keys()) + ["deepgram"]):
            result = ModelDiscovery.list_models(provider)
            if result["llm"]:
                all_llm[provider] = result["llm"]
            if result["stt"]:
                all_stt[provider] = result["stt"]
        return {"llm": all_llm, "stt": all_stt}
