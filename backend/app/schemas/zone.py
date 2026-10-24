from typing import Literal

from geoalchemy2.shape import to_shape
from pydantic import BaseModel, Field

from app.models.zone import Zone

# GeoJSON: cada posición es [lng, lat]; el primer anillo es el borde exterior.
Ring = list[tuple[float, float]]


class Polygon(BaseModel):
    type: Literal["Polygon"] = "Polygon"
    coordinates: list[Ring] = Field(min_length=1)


class ZoneCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    geometry: Polygon


class ZoneOut(BaseModel):
    id: int
    name: str
    geometry: Polygon

    @classmethod
    def from_model(cls, zone: Zone) -> "ZoneOut":
        shape = to_shape(zone.geom)
        rings = [shape.exterior, *shape.interiors]
        return cls(
            id=zone.id,
            name=zone.name,
            geometry=Polygon(coordinates=[[(x, y) for x, y in ring.coords] for ring in rings]),
        )
