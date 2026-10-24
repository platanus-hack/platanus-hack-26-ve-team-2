from app.core.config import Settings
from app.voice.errors import VoiceUnavailableError
from app.voice.providers.anthropic.llm import ClaudeLLM, ClaudeLLMConfig


def build_llm(settings: Settings) -> ClaudeLLM:
    if settings.anthropic_api_key is None:
        raise VoiceUnavailableError("Falta ANTHROPIC_API_KEY")
    return ClaudeLLM(
        ClaudeLLMConfig(
            api_key=settings.anthropic_api_key.get_secret_value(),
            model=settings.voice_llm_model,
            max_tokens=settings.voice_llm_max_tokens,
            timeout_s=settings.voice_llm_timeout_s,
        )
    )
