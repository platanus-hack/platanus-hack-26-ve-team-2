import re

_STAGE_DIRECTIONS = re.compile(r"\*[^*]*\*|\([^)]*\)|\[[^\]]*\]")
_NON_SPEECH = re.compile(r"[#_`~>|*]|[\U0001F000-\U0001FAFF☀-➿]")
_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


def clean_for_tts(text: str) -> str:
    """El LLM a veces mete *acotaciones*, emojis o markdown: fuera antes del TTS."""
    text = _STAGE_DIRECTIONS.sub("", text)
    text = _NON_SPEECH.sub("", text)
    return re.sub(r"\s+", " ", text).strip()


def sanitize_user_text(text: str, max_chars: int) -> str:
    """Texto del usuario (escrito o transcrito): sin caracteres de control y con tope."""
    text = _CONTROL.sub(" ", text)
    return re.sub(r"\s+", " ", text).strip()[:max_chars]


# Fin de frase: puntuación (y comillas/paréntesis de cierre) seguida de espacio. Sin el espacio no
# se sabe si "3." es el final o un número que sigue llegando.
_SENTENCE_END = re.compile(r"[.!?…]+[\"»”)]*\s")


class SentenceSplitter:
    """Corta en frases el texto que llega en fragmentos (streaming del LLM) para sintetizarlas
    apenas están completas. Junta frases cortas ("Sí.") con la siguiente: cada corte suma una
    llamada al TTS y una pausa al empalmar el audio.
    """

    def __init__(self, min_chars: int = 20) -> None:
        self._min = min_chars
        self._buf = ""

    def feed(self, chunk: str) -> list[str]:
        self._buf += chunk
        out: list[str] = []
        start = 0
        for m in _SENTENCE_END.finditer(self._buf):
            candidate = self._buf[: m.end()]
            # No cortar dentro de una acotación (*sonríe. *) que clean_for_tts debe quitar entera
            if len(candidate) - start < self._min or _open_direction(candidate):
                continue
            out.append(candidate[start:].strip())
            start = m.end()
        self._buf = self._buf[start:]
        return [s for s in out if s]

    def flush(self) -> str:
        rest, self._buf = self._buf.strip(), ""
        return rest


def _open_direction(text: str) -> bool:
    return text.count("*") % 2 == 1 or text.count("(") > text.count(")")
