from app.core.config import Settings
from app.voice.errors import VoiceUnavailableError
from app.voice.providers.anthropic.llm import ClaudeLLM, ClaudeLLMConfig
from app.voice.providers.anthropic.vision import ClaudeVision, ClaudeVisionConfig


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


def build_vision(settings: Settings) -> ClaudeVision | None:
    """Sin ANTHROPIC_API_KEY no hay visión: "¿qué es esto?" lo responde el LLM sin mirar."""
    if settings.anthropic_api_key is None:
        return None
    return ClaudeVision(
        ClaudeVisionConfig(
            api_key=settings.anthropic_api_key.get_secret_value(),
            model=settings.voice_vision_model,
            max_tokens=settings.voice_vision_max_tokens,
            timeout_s=settings.voice_vision_timeout_s,
        )
    )
