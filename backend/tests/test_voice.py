"""Tests del módulo de voz con proveedores falsos (sin red ni costo)."""

import asyncio

import pytest
from fastapi.testclient import TestClient

from app import main
from app.voice.lipsync import to_visemes
from app.voice.ports import CharTiming
from app.voice.sessions import SessionStore
from app.voice.text import SentenceSplitter, clean_for_tts, sanitize_user_text
from tests.fakes import FakeLLM


def _start(client: TestClient, character: str = "bolivar") -> dict:
    r = client.post(
        "/voice/sessions", json={"location_id": "campo_carabobo", "character_id": character}
    )
    assert r.status_code == 201, r.text
    return r.json()


# ---------- REST ----------


def test_locations(client: TestClient):
    locs = client.get("/voice/locations").json()
    assert {c["id"] for c in locs[0]["characters"]} == {"bolivar", "manuela"}


def test_session_greeting_has_audio_and_visemes(client: TestClient):
    s = _start(client)
    assert len(s["session_id"]) >= 32
    assert s["greeting"]["audio_mime"] == "audio/mpeg"
    assert s["greeting"]["visemes"][0]["v"] in {"sil", "PP"}


def test_audio_turn(client: TestClient, llm: FakeLLM):
    sid = _start(client)["session_id"]
    r = client.post(
        f"/voice/sessions/{sid}/turns",
        files={"audio": ("voz.webm", b"\x1a\x45\xdf\xa3fake", "audio/webm;codecs=opus")},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["transcript"] == "hola que tal"
    assert body["reply_text"].startswith("Todo bien")  # sin la acotación *sonríe*
    assert set(body["timings_ms"]) == {"stt", "llm", "tts", "first_audio", "total"}
    # Dos frases sintetizadas por separado y unidas en un audio, con los visemas corridos
    assert body["speech"]["text"] == "Todo bien, aquí recordando Carabobo. ¿Quieres verlo?"
    starts = [v["t"] for v in body["speech"]["visemes"]]
    first_sentence_s = len("Todo bien, aquí recordando Carabobo.") * 0.05  # FakeTTS: 50 ms/letra
    assert starts == sorted(starts) and starts[-1] > first_sentence_s
    # El saludo cuenta como historial y el prompt es el del personaje de la sesión.
    assert llm.requests[0].history[0].role == "assistant"
    assert "Simón Bolívar" in llm.requests[0].system_prompt


def test_text_turn_keeps_history(client: TestClient, llm: FakeLLM):
    sid = _start(client)["session_id"]
    for q in ("hola", "¿y Páez?"):
        assert client.post(f"/voice/sessions/{sid}/turns", data={"text": q}).status_code == 200
    assert [m.content for m in llm.requests[1].history][-2] == "hola"


def test_turn_requires_exactly_one_input(client: TestClient):
    sid = _start(client)["session_id"]
    r = client.post(f"/voice/sessions/{sid}/turns")
    assert r.status_code == 422
    assert r.json()["code"] == "invalid_input"


def test_rejects_non_audio_and_oversized(client: TestClient):
    sid = _start(client)["session_id"]
    url = f"/voice/sessions/{sid}/turns"
    r = client.post(url, files={"audio": ("x.exe", b"MZ", "application/x-msdownload")})
    assert r.json()["code"] == "invalid_input"
    r = client.post(url, files={"audio": ("a.webm", b"0" * 2048, "audio/webm")})
    assert r.status_code == 422
    assert "grande" in r.json()["detail"]


def test_unknown_session_and_character(client: TestClient):
    assert client.post("/voice/sessions/nope/turns", data={"text": "hola"}).status_code == 404
    r = client.post("/voice/sessions", json={"location_id": "campo_carabobo", "character_id": "x"})
    assert r.status_code == 404
    r = client.post("/voice/sessions", json={"location_id": "../etc", "character_id": "bolivar"})
    assert r.status_code == 422  # slug inválido


def test_delete_session(client: TestClient, llm: FakeLLM):
    sid = _start(client)["session_id"]
    assert client.delete(f"/voice/sessions/{sid}").status_code == 204
    assert llm.closed == [sid]
    assert client.post(f"/voice/sessions/{sid}/turns", data={"text": "hola"}).status_code == 404


def test_voice_unavailable_returns_503(client: TestClient):
    main.app.state.voice = None
    r = client.get("/voice/locations")
    assert r.status_code == 503
    assert r.json()["code"] == "voice_unavailable"


# ---------- WebSocket ----------


def test_websocket_audio_and_text_turns(client: TestClient):
    with client.websocket_connect("/voice/ws") as ws:
        ws.send_json({"type": "text", "text": "hola"})
        assert ws.receive_json()["code"] == "session_not_found"  # falta "start"

        ws.send_json({"type": "start", "location_id": "campo_carabobo", "character_id": "manuela"})
        assert ws.receive_json()["type"] == "session"
        assert ws.receive_json()["type"] == "speech"  # saludo

        ws.send_bytes(b"\x1a\x45")
        ws.send_bytes(b"\xdf\xa3")
        ws.send_json({"type": "audio_end", "mime_type": "audio/m4a"})
        msgs = [ws.receive_json() for _ in range(5)]
        assert [m["type"] for m in msgs] == ["transcript", "speech", "speech", "reply", "turn_end"]
        # Una frase por mensaje, en orden: el cliente reproduce la primera sin esperar al resto
        assert [(m["index"], m["text"]) for m in msgs[1:3]] == [
            (0, "Todo bien, aquí recordando Carabobo."),
            (1, "¿Quieres verlo?"),
        ]
        assert msgs[4]["timings_ms"]["first_audio"] <= msgs[4]["timings_ms"]["total"]

        ws.send_json({"type": "text", "text": "¿estuviste en la batalla?"})
        types = [ws.receive_json()["type"] for _ in range(4)]
        assert types == ["speech", "speech", "reply", "turn_end"]

        ws.send_json({"type": "bogus"})
        assert ws.receive_json()["code"] == "invalid_input"
        ws.send_json({"type": "end"})


# ---------- unidades ----------


def test_session_store_evicts_oldest_when_full():
    evicted: list[str] = []

    async def on_evict(sid: str) -> None:
        evicted.append(sid)

    async def scenario() -> None:
        store = SessionStore(ttl_s=60, max_sessions=2, history_turns=1, on_evict=on_evict)
        a = await store.create("l", "c")
        await store.create("l", "c")
        await store.create("l", "c")
        assert evicted == [a.id]
        assert store.get(a.id) is None

    asyncio.run(scenario())


def test_visemes_spanish_rules():
    text = "Que llueva"
    vis = to_visemes([CharTiming(c, i * 0.1, (i + 1) * 0.1) for i, c in enumerate(text)])
    assert [v["v"] for v in vis] == ["kk", "E", "sil", "CH", "U", "E", "PP", "aa"]
    assert vis[0]["d"] == pytest.approx(0.2)  # la 'u' muda de "que" se suma a la 'q'


def test_text_cleaning():
    assert clean_for_tts("*ríe* ¡Hola! 😀 **amigo**") == "¡Hola! amigo"
    assert sanitize_user_text("hola\x00\x07   mundo " + "x" * 50, 12) == "hola mundo x"


def test_sentence_splitter_streams_complete_sentences():
    splitter = SentenceSplitter(min_chars=10)
    out: list[str] = []
    for chunk in ["¡Sí! Fue en 18", "21. *sonríe. Ya* Ganamos en ", "Carabobo. ¿Y tú?"]:
        out += splitter.feed(chunk)
    # "¡Sí!" es corta y se junta con la siguiente; "18" + "21." no se corta antes del punto,
    # y la acotación abierta tampoco se corta por su punto interno
    assert out == ["¡Sí! Fue en 1821.", "*sonríe. Ya* Ganamos en Carabobo."]
    assert splitter.flush() == "¿Y tú?"
