"""Proveedores de voz falsos (sin red ni costo) para los tests."""

from collections.abc import AsyncIterator

from app.voice.ports import (
    AudioInput,
    CharTiming,
    ChatRequest,
    LanguageModel,
    SpeechAudio,
    SpeechToText,
    TextToSpeech,
)


class FakeSTT(SpeechToText):
    name = "fake"

    async def transcribe(self, audio: AudioInput, language: str, keyterms: list[str]) -> str:
        return "hola que tal"


class FakeLLM(LanguageModel):
    name = "fake"

    def __init__(self) -> None:
        self.requests: list[ChatRequest] = []
        self.closed: list[str] = []

    REPLY = "*sonríe* Todo bien, aquí recordando Carabobo. ¿Quieres verlo?"

    async def generate(self, request: ChatRequest) -> str:
        self.requests.append(request)
        return self.REPLY

    async def stream(self, request: ChatRequest) -> AsyncIterator[str]:
        # Fragmentos que no coinciden con las frases, como los tokens de un LLM real
        self.requests.append(request)
        for i in range(0, len(self.REPLY), 7):
            yield self.REPLY[i : i + 7]

    async def close_session(self, session_id: str) -> None:
        self.closed.append(session_id)


class FakeTTS(TextToSpeech):
    name = "elevenlabs"  # reutiliza los voice_id de personas.yaml

    async def synthesize(self, text: str, voice_id: str, language: str) -> SpeechAudio:
        timings = [CharTiming(c, i * 0.05, (i + 1) * 0.05) for i, c in enumerate(text)]
        return SpeechAudio(b"ID3fake-mp3", "audio/mpeg", timings)
