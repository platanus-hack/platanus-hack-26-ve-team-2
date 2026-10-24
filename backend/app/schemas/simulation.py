from pydantic import Field

from app.schemas.voice import TurnOut


class SimulationTurnOut(TurnOut):
    """Respuesta del personaje a una pregunta dentro de una simulación."""

    session_id: str = Field(description="Envíalo en la próxima pregunta para conservar el hilo")
    simulation_id: str
    character_id: str
    character_name: str
