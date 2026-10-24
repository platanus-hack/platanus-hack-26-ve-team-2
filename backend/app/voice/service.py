"""Orquestador de la conversación. No conoce a ningún proveedor concreto (solo los puertos).

Un turno se modela como un stream de eventos (transcripción -> respuesta -> audio), así el
WebSocket puede enviar cada etapa apenas termina y el endpoint REST simplemente los agrega.
"""

import logging
import time
from collections.abc import AsyncIterator, Awaitable
from dataclasses import dataclass, field

from app.voice.errors import InvalidInputError, NoSpeechError, ProviderError, VoiceError
from app.voice.lipsync import Viseme, to_visemes
from app.voice.personas import Character, Location, PersonaCatalog
from app.voice.ports import (
    AudioInput,
    ChatMessage,
    ChatRequest,
    LanguageModel,
    SpeechAudio,
    SpeechToText,
    TextToSpeech,
)
from app.voice.sessions import SessionStore, VoiceSession
from app.voice.text import clean_for_tts, sanitize_user_text

log = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class TranscriptEvent:
    text: str
    elapsed_ms: int


@dataclass(frozen=True, slots=True)
class ReplyEvent:
    text: str
    elapsed_ms: int


@dataclass(frozen=True, slots=True)
class SpeechEvent:
    text: str
    audio: bytes
    mime_type: str
    duration_s: float
    visemes: list[Viseme] = field(default_factory=list)
    elapsed_ms: int = 0


TurnEvent = TranscriptEvent | ReplyEvent | SpeechEvent


@dataclass(frozen=True, slots=True)
class VoiceLimits:
    language: str
    max_audio_bytes: int
    max_text_chars: int


class ConversationService:
    def __init__(
        self,
        stt: SpeechToText,
        llm: LanguageModel,
        tts: TextToSpeech,
        catalog: PersonaCatalog,
        sessions: SessionStore,
        limits: VoiceLimits,
    ) -> None:
        self.stt, self.llm, self.tts = stt, llm, tts
        self.catalog = catalog
        self.sessions = sessions
        self.limits = limits

    async def startup(self) -> None:
        for provider in (self.stt, self.llm, self.tts):
            await provider.startup()

    async def shutdown(self) -> None:
        await self.sessions.clear()
        for provider in (self.stt, self.llm, self.tts):
            await provider.shutdown()

    # ---------- sesiones ----------

    async def start_session(
        self, location_id: str, character_id: str
    ) -> tuple[VoiceSession, SpeechEvent]:
        """Al entrar en rango: saludo fijo (sin LLM, latencia mínima) + precalentar el LLM."""
        session = await self.open_session(location_id, character_id)
        _, char = self.catalog.get(location_id, character_id)
        session.history.append(ChatMessage("assistant", char.greeting))
        return session, await self._speak(char.greeting, char)

    async def open_session(
        self, location_id: str, character_id: str, context: str | None = None
    ) -> VoiceSession:
        """Sesión sin saludo. `context` reemplaza el contexto del sitio en el system prompt."""
        loc, char = self.catalog.get(location_id, character_id)
        session = await self.sessions.create(loc.id, char.id, context)
        await self._call("llm", self.llm.open_session(session.id, self._prompt(loc, char, context)))
        return session

    def get_session(self, session_id: str) -> VoiceSession | None:
        return self.sessions.get(session_id)

    async def end_session(self, session_id: str) -> None:
        await self.sessions.delete(session_id)

    # ---------- turno ----------

    async def run_turn(
        self, session: VoiceSession, *, audio: AudioInput | None = None, text: str = ""
    ) -> AsyncIterator[TurnEvent]:
        if (audio is None) == (not text.strip()):
            raise InvalidInputError("Envía audio o texto (uno de los dos)")
        if audio is not None and len(audio.data) > self.limits.max_audio_bytes:
            raise InvalidInputError("Audio demasiado grande")
        loc, char = self.catalog.get(session.location_id, session.character_id)

        async with session.lock:
            # 1) Voz -> texto
            if audio is not None:
                t = time.perf_counter()
                raw = await self._call(
                    "stt", self.stt.transcribe(audio, self.limits.language, loc.keyterms)
                )
                user_text = sanitize_user_text(raw, self.limits.max_text_chars)
                yield TranscriptEvent(user_text, _ms(t))
            else:
                user_text = sanitize_user_text(text, self.limits.max_text_chars)
            if not user_text:
                raise NoSpeechError("No se detectó voz")

            # 2) LLM con el prompt de la ubicación/personaje
            t = time.perf_counter()
            request = ChatRequest(
                session_id=session.id,
                system_prompt=self._prompt(loc, char, session.context),
                history=list(session.history),
                user_text=user_text,
            )
            reply = clean_for_tts(await self._call("llm", self.llm.generate(request)))
            if not reply:
                raise ProviderError("llm")
            session.history.append(ChatMessage("user", user_text))
            session.history.append(ChatMessage("assistant", reply))
            yield ReplyEvent(reply, _ms(t))

            # 3) Texto -> voz + visemas
            yield await self._speak(reply, char)

    # ---------- internos ----------

    def _prompt(self, loc: Location, char: Character, context: str | None = None) -> str:
        return self.catalog.system_prompt(loc, char, context)

    async def _speak(self, text: str, char: Character) -> SpeechEvent:
        voice_id = char.voices.get(self.tts.name)
        if voice_id is None:
            raise VoiceError(f"'{char.id}' no tiene voz para el TTS '{self.tts.name}'")
        t = time.perf_counter()
        speech: SpeechAudio = await self._call(
            "tts", self.tts.synthesize(text, voice_id, self.limits.language)
        )
        return SpeechEvent(
            text=text,
            audio=speech.audio,
            mime_type=speech.mime_type,
            duration_s=round(speech.duration_s, 3),
            visemes=to_visemes(speech.char_timings),
            elapsed_ms=_ms(t),
        )

    @staticmethod
    async def _call[T](stage: str, awaitable: Awaitable[T]) -> T:
        """Traduce fallos del proveedor a ProviderError, sin filtrar detalles al cliente."""
        try:
            return await awaitable
        except VoiceError:
            raise
        except Exception as e:
            log.exception("Fallo del proveedor en %s", stage)
            raise ProviderError(stage) from e


def _ms(t: float) -> int:
    return int((time.perf_counter() - t) * 1000)
