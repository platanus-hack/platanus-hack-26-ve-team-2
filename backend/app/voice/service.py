"""Orquestador de la conversación. No conoce a ningún proveedor concreto (solo los puertos).

Un turno se modela como un stream de eventos (transcripción -> audio por frase -> respuesta), así
el WebSocket puede enviar cada etapa apenas termina y el endpoint REST simplemente los agrega.
Cada frase del LLM se sintetiza en cuanto se completa, mientras el LLM sigue generando: el
personaje empieza a hablar con la primera frase, no al final de la respuesta.

Si la pregunta es por algo que el visitante está enfocando ("¿qué es esto?", app/voice/look.py),
el turno pide la captura (`LookEvent`), la espera y responde mirándola con el modelo de visión.
"""

import asyncio
import logging
import time
from collections.abc import AsyncIterator, Awaitable
from dataclasses import dataclass, field, replace

from app.voice.errors import InvalidInputError, NoSpeechError, ProviderError, VoiceError
from app.voice.lipsync import Viseme, to_visemes
from app.voice.look import LOOK_MARKER, LookRequests, asks_to_look
from app.voice.personas import Character, Location, PersonaCatalog
from app.voice.ports import (
    AudioInput,
    ChatMessage,
    ChatRequest,
    ImageInput,
    LanguageModel,
    SpeechAudio,
    SpeechToText,
    TextToSpeech,
    VisionModel,
)
from app.voice.sessions import SessionStore, VoiceSession
from app.voice.text import SentenceSplitter, clean_for_tts, sanitize_user_text

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
    index: int = 0  # orden de la frase dentro de la respuesta


@dataclass(frozen=True, slots=True)
class LookEvent:
    """La pregunta es por lo que enfoca la cámara: el cliente debe subir la captura con este id."""

    look_id: str


TurnEvent = TranscriptEvent | LookEvent | ReplyEvent | SpeechEvent

# Sin captura (no llegó a tiempo) o sin modelo de visión no hay qué mirar
NO_IMAGE_REPLY = (
    "No alcancé a ver lo que me muestras, amigo. Apunta la cámara al objeto o al lugar que "
    "quieres conocer y pregúntame de nuevo."
)
VISION_FAILED_REPLY = (
    "No logro distinguirlo bien, amigo. Enfoca de nuevo el objeto o el lugar y pregúntame otra vez."
)


@dataclass(frozen=True, slots=True)
class VoiceLimits:
    language: str
    max_audio_bytes: int
    max_text_chars: int
    max_image_bytes: int = 5 * 1024 * 1024
    # Cuánto espera el turno la captura que pidió con `LookEvent`
    look_wait_s: float = 8.0


class ConversationService:
    def __init__(
        self,
        stt: SpeechToText,
        llm: LanguageModel,
        tts: TextToSpeech,
        catalog: PersonaCatalog,
        sessions: SessionStore,
        limits: VoiceLimits,
        vision: VisionModel | None = None,
    ) -> None:
        self.stt, self.llm, self.tts = stt, llm, tts
        self.vision = vision
        self.catalog = catalog
        self.sessions = sessions
        self.limits = limits
        self.looks = LookRequests()

    def _providers(self) -> list:
        return [p for p in (self.stt, self.llm, self.tts, self.vision) if p is not None]

    async def startup(self) -> None:
        for provider in self._providers():
            await provider.startup()

    async def shutdown(self) -> None:
        await self.sessions.clear()
        for provider in self._providers():
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
        self,
        session: VoiceSession,
        *,
        audio: AudioInput | None = None,
        text: str = "",
        image: ImageInput | None = None,
        request_image: bool = False,
    ) -> AsyncIterator[TurnEvent]:
        """`image`: captura que el cliente ya tomó al preguntar (se usa si la pregunta es por lo que
        enfoca). `request_image`: si no la trajo, el cliente puede subirla tras un `LookEvent`."""
        if (audio is None) == (not text.strip()):
            raise InvalidInputError("Envía audio o texto (uno de los dos)")
        if audio is not None and len(audio.data) > self.limits.max_audio_bytes:
            raise InvalidInputError("Audio demasiado grande")
        if image is not None:
            self.check_image(image)
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

            # 2) LLM en streaming -> 3) TTS por frase, en paralelo con lo que falta del LLM
            t = time.perf_counter()
            request = ChatRequest(
                session_id=session.id,
                system_prompt=self._prompt(loc, char, session.context),
                history=list(session.history),
                user_text=user_text,
            )
            # ¿Pregunta por lo que enfoca? Por sus palabras (al instante) o porque el LLM lo pide
            look = self.vision is not None and asks_to_look(user_text)
            chunks: AsyncIterator[str] | None = None
            if not look:
                look, chunks = await _detect_marker(self._llm_stream(request), LOOK_MARKER)
                # Si el LLM guarda su propio historial (ElevenLabs Agents), ahí quedó el marcador
                if look:
                    await self.llm.close_session(session.id)
            if look:
                log.info("Pregunta por lo que enfoca: %r", user_text)
                if image is None and request_image and self.vision is not None:
                    look_id = self.looks.open()
                    yield LookEvent(look_id)
                    image = await self.looks.wait(look_id, self.limits.look_wait_s)
                    t = time.perf_counter()
                # Mirando la captura ya no tiene sentido la regla de pedirla ([MIRAR])
                look_request = replace(
                    request, system_prompt=self._prompt(loc, char, session.context, looking=True)
                )
                chunks = (
                    self._vision_stream(look_request, image)
                    if image is not None and self.vision is not None
                    else _once(NO_IMAGE_REPLY)
                )
            assert chunks is not None

            splitter = SentenceSplitter()
            sentences: list[str] = []
            pending: list[asyncio.Task[SpeechEvent]] = []

            def speak(sentence: str) -> None:
                if sentence := clean_for_tts(sentence):
                    sentences.append(sentence)
                    task = asyncio.create_task(self._speak(sentence, char, len(pending)))
                    pending.append(task)

            emitted = 0
            try:
                async for chunk in chunks:
                    for sentence in splitter.feed(chunk):
                        speak(sentence)
                    # Lo que ya esté sintetizado sale sin esperar al resto del LLM (en orden)
                    while emitted < len(pending) and pending[emitted].done():
                        yield pending[emitted].result()
                        emitted += 1
                speak(splitter.flush())
                llm_ms = _ms(t)
                if not sentences:
                    raise ProviderError("llm")
                while emitted < len(pending):
                    yield await pending[emitted]
                    emitted += 1
            finally:
                for task in pending[emitted:]:
                    task.cancel()

            reply = " ".join(sentences)
            session.history.append(ChatMessage("user", user_text))
            session.history.append(ChatMessage("assistant", reply))
            yield ReplyEvent(reply, llm_ms)

    def check_image(self, image: ImageInput) -> None:
        if len(image.data) > self.limits.max_image_bytes:
            raise InvalidInputError("Imagen demasiado grande")
        if image.mime_type not in ("image/jpeg", "image/png", "image/webp"):
            raise InvalidInputError("Formato de imagen no admitido (JPEG, PNG o WebP)")

    # ---------- internos ----------

    async def _vision_stream(self, request: ChatRequest, image: ImageInput) -> AsyncIterator[str]:
        """El personaje mira la captura; si la visión falla antes de hablar, lo dice."""
        assert self.vision is not None
        spoke = False
        try:
            # El marcador no se dice nunca: si aun así lo pide, es que no logró ver nada concreto
            asked_again, stream = await _detect_marker(
                self.vision.stream(request, image), LOOK_MARKER
            )
            if asked_again or stream is None:
                yield NO_IMAGE_REPLY
                return
            async for chunk in stream:
                spoke = True
                yield chunk
        except Exception:
            log.exception("Fallo del proveedor en vision")
            if spoke:
                raise ProviderError("vision") from None
            yield VISION_FAILED_REPLY

    def _prompt(
        self, loc: Location, char: Character, context: str | None = None, looking: bool = False
    ) -> str:
        return self.catalog.system_prompt(loc, char, context, looking)

    async def _llm_stream(self, request: ChatRequest) -> AsyncIterator[str]:
        """Como `_call`, para el stream del LLM."""
        try:
            async for chunk in self.llm.stream(request):
                yield chunk
        except VoiceError:
            raise
        except Exception as e:
            log.exception("Fallo del proveedor en llm")
            raise ProviderError("llm") from e

    async def _speak(self, text: str, char: Character, index: int = 0) -> SpeechEvent:
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
            index=index,
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


async def _once(text: str) -> AsyncIterator[str]:
    yield text


async def _detect_marker(
    stream: AsyncIterator[str], marker: str
) -> tuple[bool, AsyncIterator[str] | None]:
    """Mira el inicio del stream del LLM: si es `marker` lo cierra y devuelve (True, None); si no,
    (False, stream equivalente al original). Solo retiene lo justo para decidir."""
    held = ""
    async for chunk in stream:
        held += chunk
        start = held.lstrip()
        if start.startswith(marker):
            await stream.aclose()  # type: ignore[attr-defined]
            return True, None
        if not marker.startswith(start):
            break
    else:
        # El LLM terminó sin pasar de un prefijo del marcador
        return (marker in held), (None if marker in held else _once(held))

    async def rest() -> AsyncIterator[str]:
        yield held
        async for chunk in stream:
            yield chunk

    return False, rest()
