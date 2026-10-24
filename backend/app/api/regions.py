"""Regiones del mapa y arranque de simulaciones.

Flujo de la app: GET /regions → dibuja los polígonos → el usuario elige una región y toca
"Comenzar simulación" → POST /regions/{id}/simulations/start → con `simulation_id` carga los
objetos 3D locales y arranca la escena.
"""

from functools import lru_cache
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, status

from app.schemas.region import RegionOut, SimulationStartIn, SimulationStartOut
from app.simulations.errors import SimulationError
from app.simulations.repository import InMemoryRegionRepository
from app.simulations.service import SimulationService

router = APIRouter(prefix="/regions", tags=["regions"])


@lru_cache
def get_simulation_service() -> SimulationService:
    return SimulationService(InMemoryRegionRepository())


SimulationDep = Annotated[SimulationService, Depends(get_simulation_service)]


@router.get("", response_model=list[RegionOut])
async def list_regions(service: SimulationDep) -> list[RegionOut]:
    return [RegionOut.from_domain(r) for r in service.list_regions()]


@router.post("/{region_id}/simulations/start", response_model=SimulationStartOut)
async def start_simulation(
    region_id: str,
    service: SimulationDep,
    payload: Annotated[SimulationStartIn | None, Body()] = None,
) -> SimulationStartOut:
    try:
        start = service.start(region_id, payload.simulation_id if payload else None)
    except SimulationError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e)) from e
    return SimulationStartOut.from_domain(start)
