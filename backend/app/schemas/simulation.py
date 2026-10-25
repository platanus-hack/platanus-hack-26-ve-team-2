from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.voice import TurnOut


class StartSimulationAction(BaseModel):
    """El personaje lanzó una escena: la app la abre cuando termina de hablar."""

    type: Literal["start_simulation"] = "start_simulation"
    simulation_id: str


class SimulationTurnOut(TurnOut):
    """Respuesta del personaje a una pregunta dentro de una simulación."""

    session_id: str = Field(description="Envíalo en la próxima pregunta para conservar el hilo")
    simulation_id: str
    character_id: str
    character_name: str
    action: StartSimulationAction | None = Field(
        default=None,
        description="Escena que la app debe abrir al terminar de hablar el personaje (null: nada)",
    )
