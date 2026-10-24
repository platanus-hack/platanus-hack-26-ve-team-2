"""Factory: nombre del proveedor (settings) -> implementación. Imports perezosos por proveedor.

Para añadir uno nuevo, p. ej. Whisper local:
    1. app/voice/providers/whisper/factory.py con build_stt(settings)
    2. _PROVIDERS["whisper"] = "app.voice.providers.whisper.factory"
    3. VOICE_STT_PROVIDER=whisper
"""

import importlib

from app.core.config import Settings
from app.voice.fallback import FallbackLanguageModel, Researcher
from app.voice.personas import PersonaCatalog
from app.voice.ports import LanguageModel, SpeechToText, TextToSpeech
from app.voice.service import ConversationService, VoiceLimits
from app.voice.sessions import SessionStore

_PROVIDERS = {
    "elevenlabs": "app.voice.providers.elevenlabs.factory",
}


def _factory(provider: str, kind: str):
    if provider not in _PROVIDERS:
        raise ValueError(f"Proveedor desconocido: {provider!r}. Disponibles: {sorted(_PROVIDERS)}")
    return getattr(importlib.import_module(_PROVIDERS[provider]), f"build_{kind}")


def _build_researcher(settings: Settings) -> Researcher | None:
    """Consulta de respaldo con Claude, solo si hay ANTHROPIC_API_KEY."""
    if settings.anthropic_api_key is None:
        return None
    from app.voice.providers.anthropic.research import ClaudeResearcher, ResearchConfig

    return ClaudeResearcher(
        ResearchConfig(
            api_key=settings.anthropic_api_key.get_secret_value(),
            model=settings.voice_fallback_model,
            max_searches=settings.voice_fallback_max_searches,
            timeout_s=settings.voice_fallback_timeout_s,
        )
    )


def build_conversation_service(settings: Settings) -> ConversationService:
    stt: SpeechToText = _factory(settings.voice_stt_provider, "stt")(settings)
    llm: LanguageModel = FallbackLanguageModel(
        _factory(settings.voice_llm_provider, "llm")(settings), _build_researcher(settings)
    )
    tts: TextToSpeech = _factory(settings.voice_tts_provider, "tts")(settings)
    sessions = SessionStore(
        ttl_s=settings.voice_session_ttl_s,
        max_sessions=settings.voice_max_sessions,
        history_turns=settings.voice_history_turns,
        on_evict=llm.close_session,
    )
    return ConversationService(
        stt=stt,
        llm=llm,
        tts=tts,
        catalog=PersonaCatalog.from_yaml(settings.voice_personas_file),
        sessions=sessions,
        limits=VoiceLimits(
            language=settings.voice_language,
            max_audio_bytes=settings.voice_max_audio_bytes,
            max_text_chars=settings.voice_max_text_chars,
        ),
    )
