"""'¿Qué es esto?': el personaje pide la captura, la mira y responde (proveedores falsos)."""

import asyncio
from collections.abc import AsyncIterator

import pytest

from app.core.config import get_settings
from app.voice.look import LOOK_MARKER, asks_to_look
from app.voice.personas import PersonaCatalog
from app.voice.ports import ChatRequest, ImageInput, LanguageModel, VisionModel
from app.voice.service import (
    NO_IMAGE_REPLY,
    ConversationService,
    LookEvent,
    ReplyEvent,
    VoiceLimits,
)
from app.voice.sessions import SessionStore
from tests.fakes import FakeLLM, FakeTTS

IMAGE = ImageInput(b"\xff\xd8fake-jpeg", "image/jpeg")


@pytest.mark.parametrize(
    "text",
    [
        "¿Qué es esto?",
        "Simón, ¿para qué era esto?",
        "Esto, ¿qué es?",
        "¿Qué lugar es este?",
        "¿Qué es esto que tengo aquí, Simón?",
        "¿Conoces este lugar?",
        "Mira esto",
    ],
)
def test_detects_questions_about_what_the_camera_shows(text: str):
    assert asks_to_look(text)


@pytest.mark.parametrize(
    "text",
    [
        "¿Qué es eso de la Gran Colombia?",
        "¿Qué fue eso de la Carta de Jamaica?",
        "¿Dónde naciste?",
        "¿Esto es verdad, que moriste en Santa Marta?",
    ],
)
def test_ignores_other_questions(text: str):
    assert not asks_to_look(text)


class FakeVision(VisionModel):
    name = "fake"
    REPLY = "Ah, un cañón de bronce. En Puerto Cabello su estruendo decidía el día."

    def __init__(self) -> None:
        self.calls: list[tuple[ChatRequest, ImageInput]] = []

    async def stream(self, request: ChatRequest, image: ImageInput) -> AsyncIterator[str]:
        self.calls.append((request, image))
        yield self.REPLY


class MarkerLLM(FakeLLM):
    """Pide mirar con el marcador, como el LLM real ante una pregunta que las frases no captan."""

    REPLY = LOOK_MARKER


def _service(llm: LanguageModel, vision: VisionModel | None) -> ConversationService:
    return ConversationService(
        stt=None,  # type: ignore[arg-type] - los turnos de estos tests son de texto
        llm=llm,
        tts=FakeTTS(),
        catalog=PersonaCatalog.from_yaml(get_settings().voice_personas_file),
        sessions=SessionStore(
            ttl_s=60, max_sessions=10, history_turns=3, on_evict=llm.close_session
        ),
        limits=VoiceLimits(language="es", max_audio_bytes=1024, max_text_chars=200, look_wait_s=1),
        vision=vision,
    )


async def _turn(service: ConversationService, text: str, deliver: ImageInput | None, **kw):
    """Corre un turno; si pide la captura (LookEvent), la entrega como lo haría POST /look."""
    session = await service.open_session("presentador", "bolivar")
    events = []
    async for event in service.run_turn(session, text=text, **kw):
        events.append(event)
        if isinstance(event, LookEvent) and deliver is not None:
            assert service.looks.deliver(event.look_id, deliver)
    return session, events


def _reply(events) -> str:
    return next(e for e in events if isinstance(e, ReplyEvent)).text


def test_phrase_requests_capture_and_answers_looking_at_it():
    llm, vision = FakeLLM(), FakeVision()
    service = _service(llm, vision)
    session, events = asyncio.run(_turn(service, "¿Qué es esto?", IMAGE, request_image=True))
    assert any(isinstance(e, LookEvent) for e in events)
    assert _reply(events) == FakeVision.REPLY
    assert llm.requests == []  # por la frase no hace falta preguntarle al LLM
    request, image = vision.calls[0]
    assert image == IMAGE
    assert "Fortín Solano" in request.system_prompt  # reconoce los emblemáticos
    assert LOOK_MARKER not in request.system_prompt  # ya está mirando: no debe volver a pedirla
    assert session.history[-1].content == FakeVision.REPLY


def test_marker_from_llm_also_requests_capture():
    vision = FakeVision()
    service = _service(MarkerLLM(), vision)
    _, events = asyncio.run(
        _turn(service, "Dime algo de lo que te estoy enseñando", IMAGE, request_image=True)
    )
    assert any(isinstance(e, LookEvent) for e in events)
    assert _reply(events) == FakeVision.REPLY
    assert LOOK_MARKER not in _reply(events)


def test_capture_sent_with_the_question_is_used_without_asking():
    vision = FakeVision()
    service = _service(FakeLLM(), vision)
    _, events = asyncio.run(_turn(service, "¿Qué es esto?", None, image=IMAGE))
    assert not any(isinstance(e, LookEvent) for e in events)
    assert vision.calls[0][1] == IMAGE


def test_without_capture_asks_to_point_the_camera():
    service = _service(FakeLLM(), FakeVision())
    _, events = asyncio.run(_turn(service, "¿Qué es esto?", None, request_image=True))
    assert _reply(events) == NO_IMAGE_REPLY


def test_marker_without_vision_is_never_spoken():
    service = _service(MarkerLLM(), None)
    _, events = asyncio.run(_turn(service, "¿Qué es esto?", None, request_image=True))
    assert not any(isinstance(e, LookEvent) for e in events)
    assert _reply(events) == NO_IMAGE_REPLY


def test_other_questions_go_to_the_llm():
    llm, vision = FakeLLM(), FakeVision()
    _, events = asyncio.run(_turn(_service(llm, vision), "¿Dónde naciste?", None))
    assert vision.calls == []
    assert len(llm.requests) == 1
    assert LOOK_MARKER not in _reply(events)


def test_rest_ask_accepts_the_capture(client):
    files = {
        "audio": ("pregunta.m4a", b"fake-m4a", "audio/m4a"),
        "image": ("captura.jpg", b"\xff\xd8fake", "image/jpeg"),
    }
    res = client.post("/simulations/bolivar_general/ask", files=files)
    assert res.status_code == 200, res.text


def test_look_upload_for_unknown_id_is_404(client):
    files = {"image": ("captura.jpg", b"\xff\xd8fake", "image/jpeg")}
    assert client.post("/simulations/bolivar_general/look/nope", files=files).status_code == 404
