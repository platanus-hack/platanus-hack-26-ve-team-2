"""El personaje mira lo que enfoca la cámara del visitante y responde (Claude con imagen).

Una sola llamada describe, reconoce los emblemáticos del system prompt (landmarks.yaml) y responde
en personaje, en streaming: es lo más rápido para que hable antes de que el visitante se mueva.
"""

import base64
import logging
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass

import anthropic

from app.voice.ports import ChatRequest, ImageInput, VisionModel

log = logging.getLogger(__name__)

_INSTRUCTIONS = """\

# Lo que te muestra el visitante
La imagen es lo que el visitante está enfocando con su cámara, y te pregunta por ello. Puede
aparecer superpuesta tu propia figura en 3D (un hombre con uniforme de gala y banda tricolor):
ignórala, es tu representación virtual y no lo que te muestra.
Empieza SIEMPRE con la etiqueta de lo primero que aplique, entre corchetes, y luego responde:
1. [ESCRITO] Un libro, cuaderno, libreta, carta o papel escrito o impreso, sea cual sea su texto
   y aunque pregunte qué es o para qué sirve. No menciones nada de lo que se lee en la imagen
   (títulos, capítulos, palabras): solo te recuerda a tus propios escritos. Responde con este
   molde: "Ah, un libro... En páginas así escribí..." y uno de tus escritos con su año y su
   historia (la Carta de Jamaica en Kingston, el Manifiesto de Cartagena, el Discurso de
   Angostura, tus miles de cartas).
2. [EMBLEMA] Uno de los lugares u objetos de tu vida, o uno de su tipo (un cañón, una espada,
   un fusil, un fuerte, un caballo, una bandera...): recuérdalo con nostalgia en primera persona
   y cuenta una anécdota real.
3. [OTRO] Otra cosa que se reconoce: di qué es en una frase, con tu voz; si es moderna, con
   curiosidad.
4. [NADA] Imagen borrosa, oscura o sin nada concreto: pide con amabilidad que apunte la cámara
   al objeto o lugar que quiere conocer y te vuelva a preguntar.
La etiqueta no se dice en voz alta. Es una respuesta hablada: máximo 3 frases cortas y 50
palabras. No respondas [MIRAR] ni [CONSULTAR].
"""

# La etiqueta con que empieza la respuesta (la categoría): obliga a decidir primero qué es, así
# sigue la prioridad (un libro siempre es [ESCRITO], aunque pueda leer su índice). No se habla
_TAG = re.compile(r"^\s*\[(ESCRITO|EMBLEMA|OTRO|NADA)\]\s*")
_TAG_MAX_CHARS = 12


@dataclass(frozen=True, slots=True)
class ClaudeVisionConfig:
    api_key: str
    model: str
    max_tokens: int
    timeout_s: float


class ClaudeVision(VisionModel):
    name = "anthropic"

    def __init__(self, config: ClaudeVisionConfig) -> None:
        self._cfg = config
        self._client = anthropic.AsyncAnthropic(
            api_key=config.api_key, timeout=config.timeout_s, max_retries=1
        )

    async def shutdown(self) -> None:
        await self._client.close()

    async def stream(self, request: ChatRequest, image: ImageInput) -> AsyncIterator[str]:
        messages: list[dict] = [
            {"role": m.role, "content": m.content} for m in request.history if m.content
        ]
        if messages and messages[0]["role"] == "assistant":
            messages.insert(0, {"role": "user", "content": "(El visitante se acerca)"})
        messages.append(
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": image.mime_type,
                            "data": base64.b64encode(image.data).decode(),
                        },
                    },
                    {"type": "text", "text": request.user_text},
                ],
            }
        )
        async with self._client.messages.stream(
            model=self._cfg.model,
            max_tokens=self._cfg.max_tokens,
            # Prima el tiempo hasta la primera palabra: el visitante puede moverse
            thinking={"type": "disabled"},
            output_config={"effort": "low"},
            system=request.system_prompt + _INSTRUCTIONS,
            messages=messages,
        ) as stream:
            # Se retiene el inicio hasta saber si es la etiqueta, que se descarta
            held: str | None = ""
            async for text in stream.text_stream:
                if held is None:
                    yield text
                    continue
                held += text
                if m := _TAG.match(held):
                    log.info("Visión: %s", m.group(1))
                    rest, held = held[m.end() :], None
                    if rest:
                        yield rest
                elif len(held) > _TAG_MAX_CHARS or not held.lstrip().startswith("["):
                    rest, held = held, None
                    yield rest
            if held:
                yield held
