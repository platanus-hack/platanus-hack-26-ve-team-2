"""Conversación por voz con personajes.

REST: un request por turno. WebSocket: un evento por etapa (transcripción, respuesta, audio).
"""

import logging
import time
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Request,
    Response,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.responses import JSONResponse
from pydantic import TypeAdapter, ValidationError
from starlette.websockets import WebSocketState

from app.schemas.voice import (
    LocationOut,
    SessionCreate,
    SessionOut,
    SpeechOut,
    TurnOut,
    WsAudioEnd,
    WsClientMessage,
    WsEnd,
    WsStart,
    WsText,
)
from app.voice.errors import (
    InvalidInputError,
    NoSpeechError,
    ProviderError,
    SessionNotFoundError,
    UnknownCharacterError,
    VoiceError,
    VoiceUnavailableError,
)
from app.voice.ports import AudioInput
from app.voice.service import (
    ConversationService,
    ReplyEvent,
    SpeechEvent,
    TranscriptEvent,
    VoiceSession,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/voice", tags=["voice"])

# Lo que graban navegadores (webm/ogg/mp4) y móviles (m4a/aac/3gp), más formatos comunes.
ALLOWED_AUDIO_MIME = {
    "audio/webm",
    "audio/ogg",
    "audio/mp4",
    "audio/m4a",
    "audio/x-m4a",
    "audio/aac",
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/3gpp",
    "audio/flac",
}

_STATUS_BY_ERROR: dict[type[VoiceError], int] = {
    UnknownCharacterError: status.HTTP_404_NOT_FOUND,
    SessionNotFoundError: status.HTTP_404_NOT_FOUND,
    InvalidInputError: status.HTTP_422_UNPROCESSABLE_CONTENT,
    NoSpeechError: status.HTTP_422_UNPROCESSABLE_CONTENT,
    ProviderError: status.HTTP_502_BAD_GATEWAY,
    VoiceUnavailableError: status.HTTP_503_SERVICE_UNAVAILABLE,
}


async def voice_error_handler(_: Request, exc: VoiceError) -> JSONResponse:
    code = _STATUS_BY_ERROR.get(type(exc), status.HTTP_500_INTERNAL_SERVER_ERROR)
    return JSONResponse({"detail": str(exc), "code": exc.code}, status_code=code)


def get_voice_service(request: Request) -> ConversationService:
    service = getattr(request.app.state, "voice", None)
    if service is None:
        raise VoiceUnavailableError("Servicio de voz no disponible (¿falta ELEVENLABS_API_KEY?)")
    return service


VoiceDep = Annotated[ConversationService, Depends(get_voice_service)]


def _session_or_404(service: ConversationService, session_id: str) -> VoiceSession:
    session = service.get_session(session_id)
    if session is None:
        raise SessionNotFoundError("Sesión inexistente o expirada")
    return session


# Cada SO deduce el MIME a su manera (o lo omite): la extensión es el respaldo.
_MIME_BY_EXTENSION = {
    "m4a": "audio/mp4",
    "mp4": "audio/mp4",
    "aac": "audio/aac",
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "webm": "audio/webm",
    "ogg": "audio/ogg",
    "3gp": "audio/3gpp",
    "flac": "audio/flac",
}


def _normalize_mime(mime: str | None, filename: str | None = None) -> str:
    """'audio/webm;codecs=opus' -> 'audio/webm'. Sin MIME útil, lo infiere de la extensión.

    Lanza si no es un formato de audio admitido.
    """
    base = (mime or "").split(";")[0].strip().lower()
    if base in ALLOWED_AUDIO_MIME:
        return base
    ext = (filename or "").rsplit(".", 1)[-1].lower() if "." in (filename or "") else ""
    if ext in _MIME_BY_EXTENSION:
        return _MIME_BY_EXTENSION[ext]
    raise InvalidInputError(f"Formato de audio no admitido: {base or 'desconocido'}")


# ---------- REST ----------


@router.get("/locations", response_model=list[LocationOut])
async def list_locations(service: VoiceDep) -> list[LocationOut]:
    return [
        LocationOut(
            id=loc.id,
            name=loc.name,
            characters=[
                {"id": c.id, "name": c.name, "greeting": c.greeting}
                for c in loc.characters.values()
            ],
        )
        for loc in service.catalog.locations.values()
    ]


@router.post("/sessions", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
async def create_session(payload: SessionCreate, service: VoiceDep) -> SessionOut:
    """Al entrar en rango: crea la sesión y devuelve el saludo del personaje en audio."""
    session, greeting = await service.start_session(payload.location_id, payload.character_id)
    return SessionOut(
        session_id=session.id,
        location_id=session.location_id,
        character_id=session.character_id,
        expires_in_s=service.sessions.ttl_s,
        greeting=SpeechOut.from_event(greeting),
    )


async def read_audio(upload: UploadFile, service: ConversationService) -> AudioInput:
    """Lee el multipart con tope de tamaño y valida el formato."""
    limit = service.limits.max_audio_bytes
    data = await upload.read(limit + 1)
    if len(data) > limit:
        raise InvalidInputError(f"Audio demasiado grande (máx. {limit // 1024} KB)")
    mime = _normalize_mime(upload.content_type, upload.filename)
    return AudioInput(data, mime, upload.filename or "audio")


async def collect_turn(
    service: ConversationService,
    session: VoiceSession,
    *,
    audio: AudioInput | None = None,
    text: str = "",
) -> TurnOut:
    """Ejecuta un turno completo y agrega sus eventos en una sola respuesta REST."""
    t0 = time.perf_counter()
    transcript, reply, speech, timings = None, "", None, {}
    async for event in service.run_turn(session, audio=audio, text=text):
        match event:
            case TranscriptEvent():
                transcript, timings["stt"] = event.text, event.elapsed_ms
            case ReplyEvent():
                reply, timings["llm"] = event.text, event.elapsed_ms
            case SpeechEvent():
                speech, timings["tts"] = event, event.elapsed_ms
    timings["total"] = int((time.perf_counter() - t0) * 1000)
    if speech is None:  # el servicio siempre termina con SpeechEvent; defensa ante regresiones
        raise ProviderError("tts")
    log.info("voice turn %s/%s %s", session.location_id, session.character_id, timings)
    return TurnOut(
        transcript=transcript,
        reply_text=reply,
        speech=SpeechOut.from_event(speech),
        timings_ms=timings,
    )


@router.post("/sessions/{session_id}/turns", response_model=TurnOut)
async def create_turn(
    session_id: str,
    service: VoiceDep,
    audio: Annotated[UploadFile | None, File(description="Grabación del visitante")] = None,
    text: Annotated[str | None, Form(max_length=2000, description="Alternativa al audio")] = None,
) -> TurnOut:
    """Un turno: audio (multipart) o texto -> transcripción, respuesta y audio con visemas."""
    session = _session_or_404(service, session_id)
    audio_in = await read_audio(audio, service) if audio is not None else None
    return await collect_turn(service, session, audio=audio_in, text=text or "")


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(session_id: str, service: VoiceDep) -> Response:
    """Al salir de rango: libera la sesión (idempotente)."""
    await service.end_session(session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- WebSocket ----------

_ws_adapter: TypeAdapter[WsClientMessage] = TypeAdapter(WsClientMessage)


@router.websocket("/ws")
async def voice_ws(ws: WebSocket) -> None:
    """Protocolo (JSON salvo el audio):

    cliente -> {"type":"start","location_id","character_id"}
               <frames binarios de audio>  +  {"type":"audio_end","mime_type":"audio/m4a"}
               {"type":"text","text":"..."}
               {"type":"end"}
    servidor -> session, speech (saludo), transcript, reply, speech, turn_end, error
    """
    service: ConversationService | None = getattr(ws.app.state, "voice", None)
    await ws.accept()
    if service is None:
        await _ws_error(ws, VoiceUnavailableError("Servicio de voz no disponible"))
        await ws.close(code=1013)
        return

    session: VoiceSession | None = None
    buffer = bytearray()
    try:
        while True:
            frame = await ws.receive()
            if frame["type"] == "websocket.disconnect":
                break
            if (chunk := frame.get("bytes")) is not None:
                if len(buffer) + len(chunk) > service.limits.max_audio_bytes:
                    buffer.clear()
                    await _ws_error(ws, InvalidInputError("Audio demasiado grande"))
                else:
                    buffer.extend(chunk)
                continue
            try:
                msg = _ws_adapter.validate_json(frame.get("text") or "")
                match msg:
                    case WsStart():
                        if session is not None:
                            await service.end_session(session.id)
                        session, greeting = await service.start_session(
                            msg.location_id, msg.character_id
                        )
                        buffer.clear()
                        await ws.send_json(
                            {
                                "type": "session",
                                "session_id": session.id,
                                "expires_in_s": service.sessions.ttl_s,
                            }
                        )
                        await _ws_speech(ws, greeting)
                    case WsAudioEnd():
                        audio = AudioInput(bytes(buffer), _normalize_mime(msg.mime_type))
                        buffer.clear()
                        await _ws_turn(ws, service, _require(session), audio=audio)
                    case WsText():
                        await _ws_turn(ws, service, _require(session), text=msg.text)
                    case WsEnd():
                        break
            except ValidationError:
                await _ws_error(ws, InvalidInputError("Mensaje inválido"))
            except VoiceError as e:
                await _ws_error(ws, e)
    except WebSocketDisconnect:
        pass
    finally:
        if session is not None:
            await service.end_session(session.id)
    if ws.client_state == WebSocketState.CONNECTED:
        await ws.close()


def _require(session: VoiceSession | None) -> VoiceSession:
    if session is None:
        raise SessionNotFoundError("Envía primero {'type': 'start', ...}")
    return session


async def _ws_turn(ws: WebSocket, service: ConversationService, session: VoiceSession, **kw):
    t0 = time.perf_counter()
    timings: dict[str, int] = {}
    async for event in service.run_turn(session, **kw):
        match event:
            case TranscriptEvent():
                timings["stt"] = event.elapsed_ms
                await ws.send_json({"type": "transcript", "text": event.text})
            case ReplyEvent():
                timings["llm"] = event.elapsed_ms
                await ws.send_json({"type": "reply", "text": event.text})
            case SpeechEvent():
                timings["tts"] = event.elapsed_ms
                await _ws_speech(ws, event)
    timings["total"] = int((time.perf_counter() - t0) * 1000)
    await ws.send_json({"type": "turn_end", "timings_ms": timings})


async def _ws_speech(ws: WebSocket, event: SpeechEvent) -> None:
    await ws.send_json({"type": "speech", **SpeechOut.from_event(event).model_dump()})


async def _ws_error(ws: WebSocket, exc: VoiceError) -> None:
    await ws.send_json({"type": "error", "code": exc.code, "message": str(exc)})
