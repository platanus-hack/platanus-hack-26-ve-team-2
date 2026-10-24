from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

APP_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Platanus AR API"
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/platanus_ar"
    cors_origins: list[str] = ["*"]
    sql_echo: bool = False

    # --- Voz (STT -> LLM -> TTS + visemas) ---
    voice_enabled: bool = True
    voice_language: str = "es"
    voice_stt_provider: str = "elevenlabs"
    voice_llm_provider: str = "anthropic"  # "elevenlabs" = Agents (sin streaming, más lento)
    voice_tts_provider: str = "elevenlabs"
    voice_personas_file: Path = APP_DIR / "voice" / "personas.yaml"
    voice_history_turns: int = 6
    voice_session_ttl_s: int = 900
    voice_max_sessions: int = 500
    voice_max_audio_bytes: int = 5 * 1024 * 1024
    voice_max_text_chars: int = 500
    # LLM principal con VOICE_LLM_PROVIDER=anthropic (usa ANTHROPIC_API_KEY)
    voice_llm_model: str = "claude-haiku-5-5"
    voice_llm_max_tokens: int = 200
    voice_llm_timeout_s: float = 15.0

    # --- ElevenLabs ---
    elevenlabs_api_key: SecretStr | None = None
    elevenlabs_stt_model: str = "scribe_v2"
    elevenlabs_tts_model: str = "eleven_flash_v2_5"  # menor latencia; eleven_v3 = más expresivo
    elevenlabs_tts_format: str = "mp3_22050_32"  # voz: 4x menos bytes que 44.1 kHz/128 kbps
    elevenlabs_llm: str = "gemini-3.5-flash-lite"  # p50 ~0.9 s medido dentro de Agents
    elevenlabs_llm_max_tokens: int = 150
    elevenlabs_llm_temperature: float = 0.7
    elevenlabs_llm_timeout_s: float = 20.0
    elevenlabs_agent_id: str = ""  # vacío = se busca/crea el agente plantilla
    elevenlabs_agent_name: str = "platanus-ar-voice-template"

    # --- Consulta de respaldo (Claude) ---
    # Solo cuando el LLM principal no conoce un dato concreto (responde el marcador de
    # app/voice/fallback.py): Claude lo verifica con búsqueda web y responde en personaje.
    # Sin ANTHROPIC_API_KEY no hay respaldo y el personaje dice que no lo recuerda.
    anthropic_api_key: SecretStr | None = None
    voice_fallback_model: str = "claude-haiku-5-5"
    voice_fallback_max_searches: int = 2
    voice_fallback_timeout_s: float = 15.0

    # --- "¿Qué es esto?": el personaje mira lo que enfoca la cámara (Claude con imagen) ---
    voice_vision_model: str = "claude-haiku-5-5"
    voice_vision_max_tokens: int = 180
    voice_vision_timeout_s: float = 15.0
    # Cuánto espera el turno la captura que sube la app tras el aviso "look"
    voice_look_wait_s: float = 8.0
    voice_max_image_bytes: int = 5 * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
