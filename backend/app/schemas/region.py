from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.voice import Slug
from app.schemas.zone import Polygon
from app.simulations.domain import Region, Simulation, SimulationStart


class LatLng(BaseModel):
    lat: float
    lng: float


class SimulationSummaryOut(BaseModel):
    id: str
    title: str
    description: str
    kind: Literal["general", "scene"] = Field(
        description="general = conversación con el presentador; scene = escena histórica"
    )

    @classmethod
    def from_domain(cls, sim: Simulation) -> "SimulationSummaryOut":
        return cls(id=sim.id, title=sim.title, description=sim.description, kind=sim.kind)


class RegionOut(BaseModel):
    id: str
    name: str
    description: str
    geometry: Polygon
    center: LatLng
    simulations: list[SimulationSummaryOut]

    @classmethod
    def from_domain(cls, region: Region) -> "RegionOut":
        lng, lat = region.center
        return cls(
            id=region.id,
            name=region.name,
            description=region.description,
            geometry=Polygon(coordinates=[list(ring) for ring in region.rings]),
            center=LatLng(lat=lat, lng=lng),
            simulations=[SimulationSummaryOut.from_domain(s) for s in region.simulations],
        )


class SimulationStartIn(BaseModel):
    simulation_id: Slug | None = Field(
        default=None, description="Vacío = la simulación por defecto de la región"
    )


class SimulationStartOut(BaseModel):
    simulation_id: str = Field(description="Clave para cargar los objetos 3D guardados en la app")
    region_id: str
    voice_location_id: str = Field(description="location_id para POST /voice/sessions")

    @classmethod
    def from_domain(cls, start: SimulationStart) -> "SimulationStartOut":
        return cls(
            simulation_id=start.simulation.id,
            region_id=start.region_id,
            voice_location_id=start.simulation.voice_location_id,
        )
