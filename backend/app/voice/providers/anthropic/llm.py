"""LLM principal con Claude directo y streaming.

Frente a ElevenLabs Agents: sin handshake por WebSocket al abrir la sesión, sin respuestas
truncadas que reintentar y con tokens en streaming, así el TTS arranca con la primera frase.
El historial lo guarda nuestra sesión y viaja completo en cada turno.
"""

from collections.abc import AsyncIterator
from dataclasses import dataclass

import anthropic

from app.voice.ports import ChatRequest, LanguageModel


@dataclass(frozen=True, slots=True)
class ClaudeLLMConfig:
    api_key: str
    model: str
    max_tokens: int
    timeout_s: float


class ClaudeLLM(LanguageModel):
    name = "anthropic"

    def __init__(self, config: ClaudeLLMConfig) -> None:
        self._cfg = config
        self._client = anthropic.AsyncAnthropic(
            api_key=config.api_key, timeout=config.timeout_s, max_retries=1
        )

    async def shutdown(self) -> None:
        await self._client.close()

    async def generate(self, request: ChatRequest) -> str:
        return "".join([chunk async for chunk in self.stream(request)]).strip()

    async def stream(self, request: ChatRequest) -> AsyncIterator[str]:
        messages: list[dict] = [
            {"role": m.role, "content": m.content} for m in request.history if m.content
        ]
        # La API exige que el primer mensaje sea del usuario; el saludo (o el historial recortado)
        # puede empezar por el personaje
        if messages and messages[0]["role"] == "assistant":
            messages.insert(0, {"role": "user", "content": "(El visitante se acerca)"})
        messages.append({"role": "user", "content": request.user_text})
        async with self._client.messages.stream(
            model=self._cfg.model,
            max_tokens=self._cfg.max_tokens,
            # Charla de 1-2 frases: sin razonamiento, prima el tiempo hasta la primera palabra
            thinking={"type": "disabled"},
            output_config={"effort": "low"},
            system=request.system_prompt,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield text
