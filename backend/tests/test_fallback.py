"""Consulta de respaldo: solo cuando el LLM principal responde el marcador."""

import asyncio

from app.core.config import get_settings
from app.voice.fallback import FALLBACK_MARKER, FallbackLanguageModel
from app.voice.personas import PersonaCatalog
from app.voice.ports import ChatRequest, LanguageModel

REQUEST = ChatRequest(
    session_id="s1", system_prompt="Eres Bolívar.", history=[], user_text="¿Cuándo te exhumaron?"
)


class ScriptedLLM(LanguageModel):
    name = "fake"

    def __init__(self, reply: str) -> None:
        self.reply = reply
        self.closed: list[str] = []

    async def generate(self, request: ChatRequest) -> str:
        return self.reply

    async def close_session(self, session_id: str) -> None:
        self.closed.append(session_id)


class FakeResearcher:
    def __init__(self, answer: str = "", error: Exception | None = None) -> None:
        self.answer_text = answer
        self.error = error
        self.requests: list[ChatRequest] = []

    async def answer(self, request: ChatRequest) -> str:
        self.requests.append(request)
        if self.error:
            raise self.error
        return self.answer_text

    async def shutdown(self) -> None:
        pass


def _generate(primary: LanguageModel, researcher: FakeResearcher | None) -> str:
    return asyncio.run(FallbackLanguageModel(primary, researcher).generate(REQUEST))


def test_known_answer_does_not_consult():
    researcher = FakeResearcher("no debería usarse")
    assert _generate(ScriptedLLM("Nací en Caracas."), researcher) == "Nací en Caracas."
    assert researcher.requests == []


def test_marker_consults_and_resets_primary_conversation():
    primary = ScriptedLLM(FALLBACK_MARKER)
    researcher = FakeResearcher("Me exhumaron en 2010 para estudiar mis restos.")
    assert _generate(primary, researcher) == "Me exhumaron en 2010 para estudiar mis restos."
    assert researcher.requests == [REQUEST]
    # La conversación del LLM principal guardó el marcador: se reabre con nuestro historial
    assert primary.closed == ["s1"]


def test_marker_without_researcher_or_on_error_admits_it():
    for researcher in (None, FakeResearcher(error=RuntimeError("sin red")), FakeResearcher("")):
        reply = _generate(ScriptedLLM(FALLBACK_MARKER), researcher)
        assert FALLBACK_MARKER not in reply
        assert "no lo recuerdo" in reply


def test_prompts_ask_for_the_marker_and_only_presenter_knows_all_history():
    catalog = PersonaCatalog.from_yaml(get_settings().voice_personas_file)
    general = catalog.system_prompt(*catalog.get("presentador", "bolivar"))
    scene = catalog.system_prompt(*catalog.get("campo_carabobo", "bolivar"))
    assert FALLBACK_MARKER in general and FALLBACK_MARKER in scene
    assert "después de tu muerte" in general
    assert "curiosidad de tu época" in scene and "después de tu muerte" not in scene
