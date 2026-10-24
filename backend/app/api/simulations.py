"""Conversación por voz dentro de una simulación.

La app solo conoce el `simulation_id`: el servidor resuelve el personaje y el prompt del sitio
histórico (p. ej. Campo de Carabobo) y se los pasa al servicio de voz. Así el prompt nunca viaja
por la red ni puede alterarlo el cliente.

Dos formas de preguntar: REST (`/ask`, todo en una respuesta) o WebSocket (`/ws`, más rápido: la
sesión se abre al conectar y el audio llega frase por frase).
"""

from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, WebSocket, status
from pydantic import TypeAdapter, ValidationError
from starlette.websockets import WebSocketDisconnect, WebSocketState

from app.api.deps import SimulationDep
from app.api.voice import VoiceDep, collect_turn, normalize_mime, read_audio, ws_error, ws_turn
from app.schemas.simulation import SimulationTurnOut
from app.schemas.voice import WsAudioEnd, WsEnd
from app.simulations.domain import Simulation
from app.simulations.errors import SimulationError
from app.voice.errors import InvalidInputError, VoiceError, VoiceUnavailableError
from app.voice.ports import AudioInput
from app.voice.service import ConversationService
from app.voice.sessions import VoiceSession

router = APIRouter(prefix="/simulations", tags=["simulations"])


@router.post("/{simulation_id}/ask", response_model=SimulationTurnOut)
async def ask(
    simulation_id: str,
    simulations: SimulationDep,
    voice: VoiceDep,
    audio: Annotated[UploadFile, File(description="Pregunta grabada (push-to-talk)")],
    session_id: Annotated[
        str | None, Form(max_length=64, description="De la respuesta anterior, si hay")
    ] = None,
) -> SimulationTurnOut:
    """Pregunta por voz -> transcripción, respuesta del personaje y audio con visemas (lipsync)."""
    try:
        simulation = simulations.get_simulation(simulation_id)
    except SimulationError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e)) from e

    audio_in = await read_audio(audio, voice)
    session = await _session_for(voice, simulation, session_id)
    turn = await collect_turn(voice, session, audio=audio_in)
    _, character = voice.catalog.get(simulation.voice_location_id, simulation.character_id)
    return SimulationTurnOut(
        **turn.model_dump(),
        session_id=session.id,
        simulation_id=simulation.id,
        character_id=character.id,
        character_name=character.name,
    )


_ws_adapter: TypeAdapter[WsAudioEnd | WsEnd] = TypeAdapter(WsAudioEnd | WsEnd)


@router.websocket("/{simulation_id}/ws")
async def ask_ws(
    ws: WebSocket,
    simulation_id: str,
    simulations: SimulationDep,
    session_id: str | None = None,
) -> None:
    """Conversación por WebSocket. Protocolo (JSON salvo el audio):

    conectar -> servidor: {"type":"session","session_id"} (reusa `?session_id=` si sigue viva)
    cliente  -> <frames binarios de audio> + {"type":"audio_end","mime_type":"audio/m4a"}
                {"type":"end"}
    servidor -> transcript, speech (uno por frase, con `index`), reply, turn_end, error
    """
    voice: ConversationService | None = getattr(ws.app.state, "voice", None)
    await ws.accept()
    try:
        simulation = simulations.get_simulation(simulation_id)
    except SimulationError as e:
        await ws.send_json({"type": "error", "code": "not_found", "message": str(e)})
        await ws.close(code=1008)
        return
    if voice is None:
        await ws_error(ws, VoiceUnavailableError("Servicio de voz no disponible"))
        await ws.close(code=1013)
        return

    buffer = bytearray()
    try:
        # Abrir la sesión al conectar: la primera pregunta no paga ese tiempo
        session = await _session_for(voice, simulation, session_id)
        await ws.send_json({"type": "session", "session_id": session.id})
        while True:
            frame = await ws.receive()
            if frame["type"] == "websocket.disconnect":
                break
            if (chunk := frame.get("bytes")) is not None:
                if len(buffer) + len(chunk) > voice.limits.max_audio_bytes:
                    buffer.clear()
                    await ws_error(ws, InvalidInputError("Audio demasiado grande"))
                else:
                    buffer.extend(chunk)
                continue
            try:
                msg = _ws_adapter.validate_json(frame.get("text") or "")
                if isinstance(msg, WsEnd):
                    break
                audio = AudioInput(bytes(buffer), normalize_mime(msg.mime_type))
                buffer.clear()
                # La sesión pudo expirar entre preguntas: se reabre sin cortar la conversación
                if voice.get_session(session.id) is None:
                    session = await _session_for(voice, simulation, None)
                    await ws.send_json({"type": "session", "session_id": session.id})
                await ws_turn(ws, voice, session, audio=audio)
            except ValidationError:
                await ws_error(ws, InvalidInputError("Mensaje inválido"))
            except VoiceError as e:
                await ws_error(ws, e)
    except WebSocketDisconnect:
        pass
    except VoiceError as e:
        await ws_error(ws, e)
    # La sesión no se cierra: la app puede reconectar (o usar /ask) con el mismo session_id
    if ws.client_state == WebSocketState.CONNECTED:
        await ws.close()


async def _session_for(
    voice: ConversationService, simulation: Simulation, session_id: str | None
) -> VoiceSession:
    """Reutiliza la sesión si sigue viva y es de esta simulación; si no, abre una nueva.

    Una sesión expirada o ajena no es un error: el visitante simplemente sigue preguntando.
    """
    session = voice.get_session(session_id) if session_id else None
    if session is not None and (
        session.location_id == simulation.voice_location_id
        and session.character_id == simulation.character_id
        and session.context == simulation.prompt
    ):
        return session
    return await voice.open_session(
        simulation.voice_location_id, simulation.character_id, context=simulation.prompt
    )
