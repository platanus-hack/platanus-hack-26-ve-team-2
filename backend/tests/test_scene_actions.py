"""El presentador lanza una escena desde la conversación: `[ESCENA:<id>]` al inicio."""

import asyncio

import pytest
from fastapi.testclient import TestClient

from app.voice.service import ActionEvent, _extract_action
from tests.fakes import FakeLLM

AUDIO = {"audio": ("pregunta.m4a", b"fake-m4a", "audio/m4a")}
INTRO = "Ah, el castillo de San Felipe, amigo. Mira lo que pasó."


def _ask(client: TestClient, sim: str):
    return client.post(f"/simulations/{sim}/ask", files=AUDIO)


async def _chunks(*parts: str):
    for p in parts:
        yield p


@pytest.mark.parametrize(
    ("parts", "action", "spoken"),
    [
        (["[ESC", "ENA:bata", "lla] Ah, ", "mira."], ActionEvent("ESCENA", "batalla"), "Ah, mira."),
        ([" [ESCENA:batalla]"], ActionEvent("ESCENA", "batalla"), ""),
        (["Hola ", "amigo."], None, "Hola amigo."),
        # Un corchete que no es etiqueta se habla tal cual
        (["[sonríe] Hola."], None, "[sonríe] Hola."),
    ],
)
def test_extract_action(parts, action, spoken):
    async def run():
        found, rest = await _extract_action(_chunks(*parts))
        return found, "".join([c async for c in rest]).strip()

    assert asyncio.run(run()) == (action, spoken)


def test_presenter_launches_scene_and_does_not_say_the_tag(client, llm: FakeLLM):
    llm.REPLY = f"[ESCENA:batalla] {INTRO}"
    body = _ask(client, "bolivar_general").json()
    assert body["action"] == {"type": "start_simulation", "simulation_id": "batalla"}
    assert body["reply_text"] == INTRO
    assert "ESCENA" not in body["speech"]["text"]


def test_tag_alone_still_speaks(client, llm: FakeLLM):
    llm.REPLY = "[ESCENA:trincheras]"
    body = _ask(client, "bolivar_general").json()
    assert body["action"] == {"type": "start_simulation", "simulation_id": "trincheras"}
    assert body["reply_text"]


@pytest.mark.parametrize(
    ("sim", "reply"),
    [
        ("bolivar_general", "[ESCENA:inventada] Hola."),  # id que no existe
        ("bolivar_general", "[ESCENA:bolivar_general] Hola."),  # no es una escena
        ("batalla", "[ESCENA:trincheras] Hola."),  # dentro de una escena no se lanzan otras
        ("bolivar_general", "[OTRA:batalla] Hola."),  # acción desconocida
    ],
)
def test_invalid_actions_are_ignored(client, llm: FakeLLM, sim, reply):
    llm.REPLY = reply
    body = _ask(client, sim).json()
    assert body["action"] is None
    assert body["reply_text"] == "Hola."


def test_no_tag_no_action(client):
    assert _ask(client, "bolivar_general").json()["action"] is None


def test_ws_sends_action_before_speech(client, llm: FakeLLM):
    llm.REPLY = f"[ESCENA:batalla] {INTRO}"
    with client.websocket_connect("/simulations/bolivar_general/ws") as ws:
        assert ws.receive_json()["type"] == "session"
        ws.send_bytes(b"fake-m4a")
        ws.send_json({"type": "audio_end", "mime_type": "audio/m4a"})
        msgs = []
        while not msgs or msgs[-1]["type"] != "turn_end":
            msgs.append(ws.receive_json())
        types = [m["type"] for m in msgs]
        assert types[:2] == ["transcript", "action"]
        assert msgs[1]["action"] == {"type": "start_simulation", "simulation_id": "batalla"}
        assert all("ESCENA" not in m.get("text", "") for m in msgs)
        ws.send_json({"type": "end"})


def test_presenter_prompt_lists_scenes_with_ids():
    from app.simulations.catalog import CUBO_NEGRO

    prompt = CUBO_NEGRO.default_simulation.prompt
    for scene in CUBO_NEGRO.scenes:
        assert f"- {scene.id}: «{scene.title}»" in prompt
