from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from geoalchemy2.shape import from_shape
from shapely.geometry import shape
from sqlalchemy import func, select

from app.db.session import SessionDep
from app.models.zone import Zone
from app.schemas.zone import ZoneCreate, ZoneOut

router = APIRouter(prefix="/zones", tags=["zones"])


@router.get("", response_model=list[ZoneOut])
async def list_zones(session: SessionDep) -> list[ZoneOut]:
    zones = await session.scalars(select(Zone).order_by(Zone.id))
    return [ZoneOut.from_model(z) for z in zones]


@router.post("", response_model=ZoneOut, status_code=status.HTTP_201_CREATED)
async def create_zone(payload: ZoneCreate, session: SessionDep) -> ZoneOut:
    polygon = shape(payload.geometry.model_dump())
    if not polygon.is_valid:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Polígono inválido")
    zone = Zone(name=payload.name, geom=from_shape(polygon, srid=4326))
    session.add(zone)
    await session.commit()
    await session.refresh(zone)
    return ZoneOut.from_model(zone)


@router.get("/contains", response_model=list[ZoneOut])
async def zones_containing_point(
    session: SessionDep,
    lat: Annotated[float, Query(ge=-90, le=90)],
    lng: Annotated[float, Query(ge=-180, le=180)],
) -> list[ZoneOut]:
    """Zonas que contienen el punto (lat, lng). Si hay alguna, la app activa la animación AR."""
    point = func.ST_SetSRID(func.ST_MakePoint(lng, lat), 4326)
    zones = await session.scalars(select(Zone).where(func.ST_Contains(Zone.geom, point)))
    return [ZoneOut.from_model(z) for z in zones]
