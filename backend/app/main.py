import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import health, regions, simulations, voice, zones
from app.core.config import get_settings
from app.voice.errors import VoiceError
from app.voice.registry import build_conversation_service

settings = get_settings()
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # La voz es opcional: si falta la API key o el proveedor falla, el resto de la API sigue viva
    # y los endpoints /voice responden 503.
    app.state.voice = None
    if settings.voice_enabled:
        try:
            service = build_conversation_service(settings)
            await service.startup()
            app.state.voice = service
        except Exception:
            log.exception("Servicio de voz deshabilitado: no se pudo inicializar")
    yield
    if app.state.voice is not None:
        await app.state.voice.shutdown()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_exception_handler(VoiceError, voice.voice_error_handler)

app.include_router(health.router)
app.include_router(zones.router)
app.include_router(regions.router)
app.include_router(simulations.router)
app.include_router(voice.router)
