from datetime import datetime

from geoalchemy2 import Geometry, WKBElement
from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Zone(Base):
    """Polígono geográfico que activa una experiencia AR cuando el usuario está dentro."""

    __tablename__ = "zones"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    # GeoAlchemy2 crea automáticamente el índice GIST (spatial_index=True por defecto).
    geom: Mapped[WKBElement] = mapped_column(Geometry("POLYGON", srid=4326))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
