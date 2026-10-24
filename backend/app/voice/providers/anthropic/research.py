"""Consulta de respaldo con Claude: verifica en la web un dato que el LLM principal no conoce.

Solo se usa para esos casos (ver app/voice/fallback.py): suma ~3-6 s al turno por la búsqueda.
Sin buscar, Haiku se equivocó en pruebas con fechas posteriores a 1830 (p. ej. el traslado de los
restos de Bolívar al Panteón Nacional), así que se le pide verificar siempre.
"""

import logging
from dataclasses import dataclass

import anthropic

from app.voice.ports import ChatRequest

log = logging.getLogger(__name__)

_INSTRUCTIONS = """\

# Consulta
La pregunta del visitante pide un dato concreto que debes verificar: búscalo SIEMPRE en la web
antes de responder y usa solo lo que encuentres en fuentes confiables. Responde con las mismas
reglas de arriba (en personaje, en español, máximo 2 frases y 30 palabras, sin markdown, sin
enlaces ni citas). Si no encuentras el dato, dilo con naturalidad, sin inventar.
"""

# Si el servidor corta la búsqueda (pause_turn) se reanuda como mucho estas veces
_MAX_CONTINUATIONS = 2


@dataclass(frozen=True, slots=True)
class ResearchConfig:
    api_key: str
    model: str
    max_searches: int
    timeout_s: float


class ClaudeResearcher:
    def __init__(self, config: ResearchConfig) -> None:
        self._cfg = config
        self._client = anthropic.AsyncAnthropic(
            api_key=config.api_key, timeout=config.timeout_s, max_retries=1
        )

    async def answer(self, request: ChatRequest) -> str:
        """Respuesta del personaje verificada en la web; "" si Claude no pudo responder."""
        messages: list[dict] = [
            {"role": m.role, "content": m.content} for m in request.history if m.content
        ]
        messages.append({"role": "user", "content": request.user_text})
        response = None
        for _ in range(_MAX_CONTINUATIONS + 1):
            response = await self._client.messages.create(
                model=self._cfg.model,
                max_tokens=2048,
                # Respuesta corta y rápida: el razonamiento profundo no hace falta para un dato
                output_config={"effort": "low"},
                system=request.system_prompt + _INSTRUCTIONS,
                tools=[
                    {
                        "type": "web_search_20250305",
                        "name": "web_search",
                        "max_uses": self._cfg.max_searches,
                    }
                ],
                messages=messages,
            )
            if response.stop_reason != "pause_turn":
                break
            # El servidor reanuda la búsqueda al reenviar su turno tal cual
            messages = [*messages, {"role": "assistant", "content": response.content}]
        if response is None or response.stop_reason == "refusal":
            return ""
        return "".join(b.text for b in response.content if b.type == "text").strip()

    async def shutdown(self) -> None:
        await self._client.close()
