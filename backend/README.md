# Backend — FastAPI + PostgreSQL/PostGIS

API para la app AR. Guarda **zonas** (polígonos PostGIS) y responde si un punto (lat/lng) está
dentro de alguna; la app usa eso para activar la animación AR.

Stack: FastAPI · SQLAlchemy 2 (async, asyncpg) · GeoAlchemy2 + Shapely · Alembic · uv.

## Con Docker (recomendado)
Desde la raíz del repo:
```bash
docker compose up --build
```
Levanta `db` (`postgis/postgis:16-3.4`) y `api` en http://localhost:8000 (docs en `/docs`).
El contenedor de la API corre `alembic upgrade head` antes de arrancar.

## Local
```bash
cd backend
uv sync
cp .env.example .env
docker compose up -d db                # solo la base de datos (desde la raíz)
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

## Endpoints
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Liveness |
| GET | `/health/db` | Verifica conexión y versión de PostGIS |
| GET | `/zones` | Lista zonas |
| POST | `/zones` | Crea zona: `{"name": "...", "geometry": {"type": "Polygon", "coordinates": [[[lng, lat], ...]]}}` |
| GET | `/zones/contains?lat=&lng=` | Zonas que contienen el punto (`ST_Contains`) |

Coordenadas en formato GeoJSON: `[lng, lat]`, SRID 4326, anillo cerrado (primer punto = último).

## Migraciones
```bash
uv run alembic revision --autogenerate -m "descripcion"
uv run alembic upgrade head
```
Registra los modelos nuevos en `app/models/__init__.py`. `alembic/env.py` usa los helpers de
GeoAlchemy2 e ignora las tablas internas de PostGIS para que autogenerate no intente borrarlas.

## Deploy
El `Dockerfile` es autocontenido: define `DATABASE_URL` (`postgresql+asyncpg://...`) apuntando a un
Postgres con la extensión PostGIS disponible; el puerto se toma de `PORT` (por defecto 8000).

## Checks
```bash
uv run ruff check . && uv run ruff format --check .
uv run pytest
```
