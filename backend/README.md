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

## Regiones y simulaciones
Una **región** es un polígono del mapa con una o más **simulaciones**. Cada simulación tiene un
prompt genérico del sitio histórico (contexto para la conversación) y objetos 3D estáticos o
dinámicos que viven en la app, indexados por `simulation_id`.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/regions` | Regiones con polígono GeoJSON, `center` y sus simulaciones |
| POST | `/regions/{id}/simulations/start` | Body opcional `{"simulation_id"}` (vacío = la por defecto) → `simulation_id`, `region_id`, `voice_location_id` |

Por ahora el catálogo está hardcodeado en `app/simulations/catalog.py` (región `cubo_negro`, en
Chuao, con la simulación `carabobo_prueba`). Arquitectura (`app/simulations/`): `domain.py`
(Region, Simulation), `repository.py` (puerto `RegionRepository` + implementación en memoria) y
`service.py` (casos de uso). Para pasar a PostGIS basta otra implementación del repositorio.

## Voz: conversación con personajes
Pipeline por turno: audio → **STT** → **LLM** (prompt de la ubicación/personaje) → **TTS** + **visemas**
para lipsync. Proveedor actual: ElevenLabs (Scribe v2, Agents text-only, Flash v2.5). Requiere
`ELEVENLABS_API_KEY` en `backend/.env`; sin ella la API arranca igual y `/voice/*` responde 503.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/voice/locations` | Ubicaciones y personajes disponibles |
| POST | `/voice/sessions` | Al entrar en rango: `{"location_id","character_id"}` → `session_id` + saludo en audio |
| POST | `/voice/sessions/{id}/turns` | Multipart: `audio` (webm/m4a/mp3/wav…, máx. 5 MB) **o** `text` |
| DELETE | `/voice/sessions/{id}` | Al salir de rango: libera la sesión |
| WS | `/voice/ws` | Lo mismo en streaming: cada etapa se envía apenas termina |

Respuesta de un turno (REST):
```json
{ "transcript": "hola qué tal", "reply_text": "Todo bien, aquí recordando Carabobo...",
  "speech": { "text": "...", "audio_b64": "...", "audio_mime": "audio/mpeg", "duration_s": 6.8,
              "visemes": [{"t": 0.07, "d": 0.069, "v": "O"}] },
  "timings_ms": {"stt": 700, "llm": 800, "tts": 1200, "total": 2700} }
```
`visemes`: `t` inicio (s), `d` duración (s), `v` ∈ `sil PP FF TH DD kk CH SS nn RR aa E I O U`
(set Oculus/Meta → blendshapes del avatar). Sincronizar con el `currentTime` del reproductor.

WebSocket `/voice/ws` (JSON salvo el audio):
```
→ {"type":"start","location_id":"campo_carabobo","character_id":"bolivar"}
← {"type":"session","session_id":...}   ← {"type":"speech", ...saludo}
→ <frames binarios con la grabación>  →  {"type":"audio_end","mime_type":"audio/m4a"}
   (o bien → {"type":"text","text":"hola"})
← {"type":"transcript","text"}  ← {"type":"reply","text"}  ← {"type":"speech",...}  ← {"type":"turn_end","timings_ms"}
← {"type":"error","code","message"}   (la conexión sigue abierta)
→ {"type":"end"}
```

Arquitectura (`app/voice/`): `ports.py` define las interfaces `SpeechToText`, `LanguageModel` y
`TextToSpeech`; `providers/elevenlabs/` las implementa; `registry.py` elige el proveedor por
settings (`VOICE_STT_PROVIDER`, …); `service.py` orquesta el turno sin conocer proveedores;
`personas.yaml` define ubicaciones, personajes, voces y el template del prompt.
Las sesiones viven en memoria con TTL (`VOICE_SESSION_TTL_S`) y tope (`VOICE_MAX_SESSIONS`): con
varias réplicas habría que moverlas a Redis.

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
