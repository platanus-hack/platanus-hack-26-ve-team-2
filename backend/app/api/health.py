from fastapi import APIRouter
from sqlalchemy import text

from app.db.session import SessionDep

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/db")
async def health_db(session: SessionDep) -> dict[str, str]:
    postgis = await session.scalar(text("SELECT postgis_version()"))
    return {"status": "ok", "postgis": str(postgis)}
