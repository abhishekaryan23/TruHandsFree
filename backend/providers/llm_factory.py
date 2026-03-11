from langchain_core.language_models.chat_models import BaseChatModel
from security.secrets_manager import SecretsManager
from utils.logger import get_logger

logger = get_logger()

class LLMFactory:
    """
    Factory to return the appropriate Langchain ChatModel based on configuration.
    """
    
    @staticmethod
    def get_llm(provider: str, model: str, temperature: float = 0.0) -> BaseChatModel:
        provider = provider.lower()
        
        api_key = SecretsManager.get_api_key(provider)
        if not api_key:
            logger.warning(f"{provider} API key not found in keychain. LLM initialization may fail or use environment variables.")

        if provider == "groq":
            from langchain_groq import ChatGroq
            return ChatGroq(
                model=model,
                temperature=temperature,
                api_key=api_key
            )
        elif provider == "openai":
            from langchain_openai import ChatOpenAI
            return ChatOpenAI(
                model=model,
                temperature=temperature,
                api_key=api_key
            )
        elif provider == "anthropic":
            from langchain_anthropic import ChatAnthropic
            return ChatAnthropic(
                model=model,
                temperature=temperature,
                api_key=api_key
            )
        else:
            raise ValueError(f"Unsupported LLM provider: {provider}")
