"""Conversación por voz dentro de una simulación.

La app solo conoce el `simulation_id`: el servidor resuelve el personaje y el prompt del sitio
histórico (p. ej. Campo de Carabobo) y se los pasa al servicio de voz. Así el prompt nunca viaja
por la red ni puede alterarlo el cliente.
"""

from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from app.api.deps import SimulationDep
from app.api.voice import VoiceDep, collect_turn, read_audio
from app.schemas.simulation import SimulationTurnOut
from app.simulations.domain import Simulation
from app.simulations.errors import SimulationError
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
