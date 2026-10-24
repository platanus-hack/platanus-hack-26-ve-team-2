"""Preguntas por lo que el visitante está enfocando con la cámara ("¿qué es esto?").

Flujo: tras transcribir, si la pregunta es de este tipo el servicio pide la captura al cliente
(evento `LookEvent` por el WebSocket), espera a que llegue por HTTP (`LookRequests`) y responde
mirándola con el modelo de visión. Se detecta de dos formas:
- frases típicas (`asks_to_look`): instantáneo, sin pasar por el LLM;
- el marcador `LOOK_MARKER`: el system prompt (personas.yaml) le pide al LLM responder solo eso
  cuando preguntan por algo que están viendo con otras palabras (cuesta lo que tarda el LLM).
"""

import asyncio
import re
import secrets
import unicodedata

from app.voice.ports import ImageInput

LOOK_MARKER = "[MIRAR]"

_THIS = r"(esto|eso|aquello|este|esta|ese|esa|aquel|aquella)"
_IS = r"(es|era|son|eran|sera|seria)"
# El demostrativo cierra la pregunta ("qué es esto", "qué es esto que tengo aquí, Simón"): así
# "qué es eso de la Gran Colombia" no cuenta, esa no es por algo que esté enfocando
_END = (
    r"( (que (tengo|veo|ves|estoy viendo|te muestro|esta)( \w+){0,3}|aqui|aca|ahi|alli"
    r"|en (mi|la) mano|delante|enfrente|al frente))?"
    r"( (simon|bolivar|libertador|general|amigo))?$"
)
_PATTERNS = [
    # "qué es esto", "y qué era eso", "qué es aquello de allá"
    rf"\bque {_IS} {_THIS}( de (aqui|aca|alla|ahi))?{_END}",
    # "esto qué es", "y eso qué era"
    rf"\b{_THIS} que {_IS}{_END}",
    # "para qué era esto", "para qué sirve esto", "para qué se usaba esto"
    rf"\bpara que (es|era|sirve|servia|se usa|se usaba|lo usaban|usaban) {_THIS}{_END}",
    # "qué lugar es este", "qué objeto es ese", "qué edificio es aquel"
    rf"\bque (lugar|sitio|objeto|cosa|edificio|arma|libro|monumento|estatua|cuadro) "
    rf"{_IS} {_THIS}{_END}",
    # "qué estoy viendo", "qué ves", "qué tengo aquí"
    r"\bque (estoy viendo|estamos viendo|ves|ve usted|tengo (aqui|aca|enfrente|delante))\b",
    # "conoces esto", "reconoces este lugar", "sabes qué es esto", "mira esto", "cuéntame de esto"
    rf"\b(conoces|reconoces|recuerdas|sabes que es|mira|cuentame (de|sobre)|hablame (de|sobre)) "
    rf"{_THIS}( (lugar|sitio|objeto|edificio|arma|libro|monumento|estatua))?{_END}",
]
_LOOK = re.compile("|".join(_PATTERNS))


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower())
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^a-zñ ]", " ", text)).strip()


def asks_to_look(text: str) -> bool:
    """True si la pregunta es por algo que el visitante está enfocando ("¿qué es esto?")."""
    return bool(_LOOK.search(_normalize(text)))


class LookRequests:
    """Capturas pedidas al cliente y aún no recibidas: el turno espera aquí la que sube por HTTP.

    Vive en memoria: el servidor corre en un solo proceso (ver Dockerfile).
    """

    def __init__(self) -> None:
        self._pending: dict[str, asyncio.Future[ImageInput]] = {}

    def open(self) -> str:
        look_id = secrets.token_urlsafe(12)
        self._pending[look_id] = asyncio.get_running_loop().create_future()
        return look_id

    async def wait(self, look_id: str, timeout_s: float) -> ImageInput | None:
        """La captura, o None si no llegó a tiempo."""
        future = self._pending[look_id]
        try:
            return await asyncio.wait_for(future, timeout_s)
        except TimeoutError:
            return None
        finally:
            self._pending.pop(look_id, None)

    def deliver(self, look_id: str, image: ImageInput) -> bool:
        """False si nadie la espera (ya expiró o el id no existe)."""
        future = self._pending.get(look_id)
        if future is None or future.done():
            return False
        future.set_result(image)
        return True
