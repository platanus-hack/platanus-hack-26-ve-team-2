from typing import Protocol

from app.simulations.catalog import REGIONS
from app.simulations.domain import Region


class RegionRepository(Protocol):
    """Puerto de lectura de regiones. Hoy en memoria; mañana PostGIS sin tocar servicio ni API."""

    def list(self) -> list[Region]: ...

    def get(self, region_id: str) -> Region | None: ...


class InMemoryRegionRepository:
    def __init__(self, regions: tuple[Region, ...] = REGIONS) -> None:
        self._regions = {r.id: r for r in regions}

    def list(self) -> list[Region]:
        return list(self._regions.values())

    def get(self, region_id: str) -> Region | None:
        return self._regions.get(region_id)
