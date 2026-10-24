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
