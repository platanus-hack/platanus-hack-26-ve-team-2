from functools import lru_cache

from elevenlabs.client import AsyncElevenLabs

from app.core.config import Settings
from app.voice.errors import VoiceUnavailableError
from app.voice.providers.elevenlabs.llm import AgentLLMConfig, ElevenLabsAgentLLM
from app.voice.providers.elevenlabs.stt import ElevenLabsSTT
from app.voice.providers.elevenlabs.tts import ElevenLabsTTS


@lru_cache
def _client(api_key: str) -> AsyncElevenLabs:
    """Un único cliente HTTP compartido por STT, LLM y TTS."""
    return AsyncElevenLabs(api_key=api_key)


def client(settings: Settings) -> AsyncElevenLabs:
    if settings.elevenlabs_api_key is None:
        raise VoiceUnavailableError("Falta ELEVENLABS_API_KEY")
    return _client(settings.elevenlabs_api_key.get_secret_value())


def build_stt(settings: Settings) -> ElevenLabsSTT:
    return ElevenLabsSTT(client(settings), settings.elevenlabs_stt_model)


def build_tts(settings: Settings) -> ElevenLabsTTS:
    return ElevenLabsTTS(
        client(settings), settings.elevenlabs_tts_model, settings.elevenlabs_tts_format
    )


def build_llm(settings: Settings) -> ElevenLabsAgentLLM:
    return ElevenLabsAgentLLM(
        client(settings),
        AgentLLMConfig(
            llm=settings.elevenlabs_llm,
            language=settings.voice_language,
            tts_model=settings.elevenlabs_tts_model,
            max_tokens=settings.elevenlabs_llm_max_tokens,
            temperature=settings.elevenlabs_llm_temperature,
            timeout_s=settings.elevenlabs_llm_timeout_s,
            agent_id=settings.elevenlabs_agent_id,
            agent_name=settings.elevenlabs_agent_name,
        ),
    )
