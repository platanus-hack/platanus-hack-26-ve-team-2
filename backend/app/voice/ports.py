"""Puertos (interfaces) de los proveedores de IA de voz.

El servicio solo depende de estas abstracciones. Para cambiar de proveedor (Whisper, Deepgram,
OpenAI, Claude, Piper, Azure...) se implementa la clase abstracta y se registra en registry.py.
"""

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Literal


@dataclass(frozen=True, slots=True)
class AudioInput:
    data: bytes
    mime_type: str
    filename: str = "audio"


@dataclass(frozen=True, slots=True)
class ChatMessage:
    role: Literal["user", "assistant"]
    content: str


@dataclass(frozen=True, slots=True)
class ChatRequest:
    session_id: str
    system_prompt: str
    history: list[ChatMessage]
    user_text: str


@dataclass(frozen=True, slots=True)
class CharTiming:
    """Tiempo de cada carácter del texto hablado (lo que devuelven los TTS con timestamps)."""

    char: str
    start: float
    end: float


@dataclass(frozen=True, slots=True)
class SpeechAudio:
    audio: bytes
    mime_type: str
    char_timings: list[CharTiming] = field(default_factory=list)

    @property
    def duration_s(self) -> float:
        return self.char_timings[-1].end if self.char_timings else 0.0


class Provider(ABC):  # noqa: B024 - base de ciclo de vida, los hooks son opcionales
    name: str = "base"

    async def startup(self) -> None:  # noqa: B027
        """Crear clientes, recursos remotos, precalentar."""

    async def shutdown(self) -> None:  # noqa: B027
        """Liberar conexiones."""


class SpeechToText(Provider):
    @abstractmethod
    async def transcribe(self, audio: AudioInput, language: str, keyterms: list[str]) -> str:
        """`keyterms`: nombres propios del sitio para sesgar el reconocimiento."""


class LanguageModel(Provider):
    @abstractmethod
    async def generate(self, request: ChatRequest) -> str:
        """Respuesta del personaje. `history` no incluye el turno actual."""

    async def stream(self, request: ChatRequest) -> AsyncIterator[str]:
        """Respuesta en fragmentos a medida que se genera (para hablar por frases).

        Por defecto un solo fragmento: los proveedores sin streaming no necesitan implementarlo.
        """
        yield await self.generate(request)

    async def open_session(self, session_id: str, system_prompt: str) -> None:  # noqa: B027
        """Opcional: preparar la sesión por adelantado para bajar la latencia del primer turno."""

    async def close_session(self, session_id: str) -> None:  # noqa: B027
        """Opcional: liberar recursos de la sesión."""


class TextToSpeech(Provider):
    @abstractmethod
    async def synthesize(self, text: str, voice_id: str, language: str) -> SpeechAudio:
        """Audio + timestamps por carácter (para lipsync). Sin timestamps: lista vacía."""
