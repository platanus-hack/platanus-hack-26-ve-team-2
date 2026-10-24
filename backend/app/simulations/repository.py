from typing import Protocol

from app.simulations.catalog import REGIONS
from app.simulations.domain import Region, Simulation


class RegionRepository(Protocol):
    """Puerto de lectura de regiones. Hoy en memoria; mañana PostGIS sin tocar servicio ni API."""

    def list(self) -> list[Region]: ...

    def get(self, region_id: str) -> Region | None: ...

    def find_simulation(self, simulation_id: str) -> Simulation | None: ...


class InMemoryRegionRepository:
    def __init__(self, regions: tuple[Region, ...] = REGIONS) -> None:
        self._regions = {r.id: r for r in regions}
        self._simulations = {s.id: s for r in regions for s in r.simulations}

    def list(self) -> list[Region]:
        return list(self._regions.values())

    def get(self, region_id: str) -> Region | None:
        return self._regions.get(region_id)

    def find_simulation(self, simulation_id: str) -> Simulation | None:
        return self._simulations.get(simulation_id)
