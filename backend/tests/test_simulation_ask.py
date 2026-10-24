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
    sim = CUBO_NEGRO.simulation("carabobo_prueba")
    assert sim is not None
    # el prompt de la simulación (no el de personas.yaml) llega al LLM
    assert sim.prompt.splitlines()[0] in llm.requests[0].system_prompt


def test_general_conversation_uses_presenter_persona(client, llm: FakeLLM):
    res = _ask(client, sim="bolivar_general")
    assert res.status_code == 200, res.text
    assert res.json()["character_name"].startswith("Simón Bolívar")
    prompt = llm.requests[0].system_prompt
    assert "Santísima Trinidad" in prompt  # persona general de Bolívar (personas.yaml)
    assert "La Batalla de Carabobo" in prompt  # ofrece las escenas de la región


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


def test_ask_infers_mime_from_extension_when_missing(client):
    # expo-file-system puede enviar el archivo sin content-type útil
    for mime in ("application/octet-stream", ""):
        files = {"audio": ("recording-123.m4a", b"fake-m4a", mime)}
        res = client.post("/simulations/carabobo_prueba/ask", files=files)
        assert res.status_code == 200, (mime, res.text)


def test_cubo_negro_is_a_circle_around_the_building():
    region = shape({"type": "Polygon", "coordinates": [list(r) for r in CUBO_NEGRO.rings]})
    center = Point(CUBO_NEGRO_CENTER)
    radii = [center.distance(Point(p)) for p in CUBO_NEGRO.rings[0]]
    assert region.is_valid and len(CUBO_NEGRO.rings[0]) > 30
    # equirectangular: el radio en grados varía con la dirección, pero en metros es constante
    assert max(radii) / min(radii) < 1.02


def test_ws_opens_session_on_connect_and_streams_sentences(client, llm: FakeLLM):
    with client.websocket_connect("/simulations/carabobo_prueba/ws") as ws:
        hello = ws.receive_json()
        assert hello["type"] == "session"
        ws.send_bytes(b"fake-")
        ws.send_bytes(b"m4a")
        ws.send_json({"type": "audio_end", "mime_type": "audio/m4a"})
        msgs = [ws.receive_json() for _ in range(5)]
        assert [m["type"] for m in msgs] == ["transcript", "speech", "speech", "reply", "turn_end"]
        assert msgs[1]["audio_b64"] and msgs[1]["visemes"]
        ws.send_json({"type": "end"})
    sim = CUBO_NEGRO.simulation("carabobo_prueba")
    assert sim is not None
    assert sim.prompt.splitlines()[0] in llm.requests[0].system_prompt
    # La sesión sobrevive al WS: /ask (o una reconexión) sigue el mismo hilo
    second = _ask(client, hello["session_id"]).json()
    assert second["session_id"] == hello["session_id"]
    assert len(llm.requests[1].history) == 2


def test_ws_reuses_session_and_rejects_bad_input(client):
    first = _ask(client).json()["session_id"]
    with client.websocket_connect(f"/simulations/carabobo_prueba/ws?session_id={first}") as ws:
        assert ws.receive_json()["session_id"] == first
        ws.send_json({"type": "start"})
        assert ws.receive_json()["code"] == "invalid_input"
        ws.send_json({"type": "audio_end", "mime_type": "text/plain"})
        assert ws.receive_json()["code"] == "invalid_input"
    with client.websocket_connect("/simulations/nope/ws") as ws:
        assert ws.receive_json()["code"] == "not_found"
