"""Dependencias compartidas entre routers."""

from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from app.simulations.repository import InMemoryRegionRepository
from app.simulations.service import SimulationService


@lru_cache
def get_simulation_service() -> SimulationService:
    return SimulationService(InMemoryRegionRepository())


SimulationDep = Annotated[SimulationService, Depends(get_simulation_service)]
