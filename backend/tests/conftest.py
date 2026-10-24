import pytest
from fastapi.testclient import TestClient

from app import main
from app.core.config import get_settings
from app.voice.personas import PersonaCatalog
from app.voice.service import ConversationService, VoiceLimits
from app.voice.sessions import SessionStore
from tests.fakes import FakeLLM, FakeSTT, FakeTTS


@pytest.fixture
def llm() -> FakeLLM:
    return FakeLLM()


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch, llm: FakeLLM):
    monkeypatch.setattr(main.settings, "voice_enabled", False)  # no tocar ElevenLabs
    settings = get_settings()
    service = ConversationService(
        stt=FakeSTT(),
        llm=llm,
        tts=FakeTTS(),
        catalog=PersonaCatalog.from_yaml(settings.voice_personas_file),
        sessions=SessionStore(
            ttl_s=60, max_sessions=10, history_turns=3, on_evict=llm.close_session
        ),
        limits=VoiceLimits(language="es", max_audio_bytes=1024, max_text_chars=100),
    )
    with TestClient(main.app) as c:
        main.app.state.voice = service
        yield c
