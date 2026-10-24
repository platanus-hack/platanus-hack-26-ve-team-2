"""LLM principal con consulta de respaldo para los datos que no conoce.

El system prompt (personas.yaml) le pide al LLM principal responder solo `FALLBACK_MARKER` cuando
le preguntan un dato concreto que no conoce con seguridad. Entonces, y solo entonces, se consulta al
`Researcher` (Claude con búsqueda web), que responde en personaje. Así el turno normal no paga la
latencia de la búsqueda.
"""

import logging
from typing import Protocol

from app.voice.ports import ChatRequest, LanguageModel

log = logging.getLogger(__name__)

FALLBACK_MARKER = "[CONSULTAR]"

# Si tampoco el respaldo pudo responder, el personaje lo admite (y la conversación sigue)
_UNKNOWN_REPLY = (
    "Eso no lo recuerdo con certeza, amigo, y prefiero no inventarlo. Pregúntame otra cosa."
)


class Researcher(Protocol):
    async def answer(self, request: ChatRequest) -> str: ...

    async def shutdown(self) -> None: ...


class FallbackLanguageModel(LanguageModel):
    def __init__(self, primary: LanguageModel, researcher: Researcher | None) -> None:
        self._primary = primary
        self._researcher = researcher
        self.name = primary.name

    async def startup(self) -> None:
        await self._primary.startup()

    async def shutdown(self) -> None:
        await self._primary.shutdown()
        if self._researcher is not None:
            await self._researcher.shutdown()

    async def open_session(self, session_id: str, system_prompt: str) -> None:
        await self._primary.open_session(session_id, system_prompt)

    async def close_session(self, session_id: str) -> None:
        await self._primary.close_session(session_id)

    async def generate(self, request: ChatRequest) -> str:
        reply = await self._primary.generate(request)
        if FALLBACK_MARKER not in reply:
            return reply
        # El LLM principal guarda su propio historial (ElevenLabs Agents) y ahí quedó el marcador:
        # se cierra su conversación para que la reabra con nuestro historial (ya con la respuesta)
        await self._primary.close_session(request.session_id)
        answer = ""
        if self._researcher is not None:
            try:
                answer = await self._researcher.answer(request)
            except Exception:
                log.exception("La consulta de respaldo falló")
        log.info("Consulta de respaldo: %r -> %r", request.user_text, answer)
        return answer.replace(FALLBACK_MARKER, "").strip() or _UNKNOWN_REPLY
