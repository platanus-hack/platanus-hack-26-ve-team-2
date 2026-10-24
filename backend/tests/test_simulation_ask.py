"""POST /simulations/{id}/ask con proveedores falsos (fixtures en conftest.py)."""

from fastapi.testclient import TestClient
from shapely.geometry import Point, shape

from app.simulations.catalog import CUBO_NEGRO, CUBO_NEGRO_CENTER
from tests.fakes import FakeLLM

AUDIO = {"audio": ("pregunta.m4a", b"fake-m4a", "audio/m4a")}


def _ask(client: TestClient, session_id: str | None = None, sim: str = "carabobo_prueba"):
    data = {"session_id": session_id} if session_id else None
    return client.post(f"/simulations/{sim}/ask", files=AUDIO, data=data)


def test_ask_returns_reply_with_lipsync_and_uses_simulation_prompt(client, llm: FakeLLM):
    res = _ask(client)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["simulation_id"] == "carabobo_prueba"
    assert body["character_id"] == "bolivar"
    assert body["character_name"].startswith("Simón Bolívar")
    assert body["transcript"] == "hola que tal"
    assert body["speech"]["audio_b64"] and body["speech"]["visemes"]
    sim = CUBO_NEGRO.simulations[0]
    # el prompt de la simulación (no el de personas.yaml) llega al LLM
    assert sim.prompt.splitlines()[0] in llm.requests[0].system_prompt


def test_ask_keeps_conversation_with_session_id(client, llm: FakeLLM):
    first = _ask(client).json()
    second = _ask(client, first["session_id"]).json()
    assert second["session_id"] == first["session_id"]
    assert len(llm.requests[1].history) == 2  # pregunta + respuesta del primer turno


def test_ask_with_unknown_or_expired_session_opens_a_new_one(client):
    res = _ask(client, "sesion-que-no-existe")
    assert res.status_code == 200
    assert res.json()["session_id"] != "sesion-que-no-existe"


def test_ask_errors(client):
    assert _ask(client, sim="nope").status_code == 404
    no_audio = client.post("/simulations/carabobo_prueba/ask")
    assert no_audio.status_code == 422
    bad_mime = client.post(
        "/simulations/carabobo_prueba/ask", files={"audio": ("x.txt", b"x", "text/plain")}
    )
    assert bad_mime.status_code == 422


def test_cubo_negro_is_a_circle_around_the_building():
    region = shape({"type": "Polygon", "coordinates": [list(r) for r in CUBO_NEGRO.rings]})
    center = Point(CUBO_NEGRO_CENTER)
    radii = [center.distance(Point(p)) for p in CUBO_NEGRO.rings[0]]
    assert region.is_valid and len(CUBO_NEGRO.rings[0]) > 30
    # equirectangular: el radio en grados varía con la dirección, pero en metros es constante
    assert max(radii) / min(radii) < 1.02
