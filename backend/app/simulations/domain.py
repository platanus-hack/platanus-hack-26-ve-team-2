"""Modelo de dominio: Region 1─N Simulation.

Los objetos 3D (estáticos o dinámicos) de cada simulación viven en el teléfono, indexados por
`Simulation.id`; el backend solo es dueño de la región, del contexto histórico (prompt) y del
inicio de la simulación.
"""

from dataclasses import dataclass
from typing import Literal

# GeoJSON: cada posición es (lng, lat); el primer anillo es el borde exterior y va cerrado.
Ring = tuple[tuple[float, float], ...]

# Etiqueta con la que el presentador lanza una escena desde la conversación: `[ESCENA:<id>]`
SCENE_ACTION = "ESCENA"


@dataclass(frozen=True, slots=True)
class Simulation:
    id: str
    title: str
    description: str
    # Prompt genérico del sitio histórico (p. ej. Campo de Carabobo): da contexto a la conversación.
    prompt: str
    # Ubicación de personas.yaml cuyos personajes conversan en esta simulación.
    voice_location_id: str
    # Personaje que responde las preguntas del visitante (voz y personalidad de personas.yaml).
    character_id: str
    # "general": conversación con el presentador (Bolívar) sobre cualquier tema de su vida, la que
    # arranca al entrar; "scene": una escena histórica concreta con su propio contexto.
    kind: Literal["general", "scene"] = "scene"
    # "open": la escena ocupa un campo de ~6 m (p. ej. las trincheras) y necesita un espacio
    # abierto; "compact": cabe alrededor del anfitrión.
    space: Literal["compact", "open"] = "compact"


@dataclass(frozen=True, slots=True)
class Region:
    """Área cerrada del mapa; dentro de ella se pueden iniciar sus simulaciones."""

    id: str
    name: str
    description: str
    rings: tuple[Ring, ...]
    simulations: tuple[Simulation, ...]

    @property
    def default_simulation(self) -> Simulation:
        return self.simulations[0]

    def simulation(self, simulation_id: str) -> Simulation | None:
        return next((s for s in self.simulations if s.id == simulation_id), None)

    @property
    def scenes(self) -> tuple[Simulation, ...]:
        """Las escenas que el presentador (la conversación general) puede lanzar."""
        return tuple(s for s in self.simulations if s.kind == "scene")

    @property
    def center(self) -> tuple[float, float]:
        """(lng, lat) promedio del borde exterior: suficiente para centrar el mapa o un pin."""
        exterior = self.rings[0][:-1]  # sin el punto de cierre repetido
        lng = sum(p[0] for p in exterior) / len(exterior)
        lat = sum(p[1] for p in exterior) / len(exterior)
        return lng, lat


@dataclass(frozen=True, slots=True)
class SimulationStart:
    region_id: str
    simulation: Simulation
