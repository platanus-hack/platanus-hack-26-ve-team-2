"""Timestamps por carácter (TTS) -> visemas, con reglas grafema->fonema del español.

El español es casi fonético, así que unas pocas reglas (dígrafos, letras mudas, c/g suaves)
bastan para un lipsync convincente sin modelo de fonemas.

Se usa el set de 15 visemas de Oculus/Meta
(sil, PP, FF, TH, DD, kk, CH, SS, nn, RR, aa, E, I, O, U), estándar de facto en Unity/Unreal,
que mapea directo a blendshapes del avatar.
"""

import unicodedata
from typing import TypedDict

from app.voice.ports import CharTiming


class Viseme(TypedDict):
    t: float  # inicio (s)
    d: float  # duración (s)
    v: str  # id del visema


_SINGLE: dict[str, str] = {}
for _v, _letters in {
    "aa": "a",
    "E": "e",
    "I": "i",
    "O": "o",
    "U": "uw",
    "PP": "pbmv",  # en español la v se pronuncia como b (bilabial)
    "FF": "f",
    "DD": "tdl",
    "kk": "kgjxq",
    "SS": "sz",  # seseo latinoamericano (z = s)
    "nn": "nñ",
    "RR": "r",
}.items():
    for _c in _letters:
        _SINGLE[_c] = _v

_FRONT_VOWELS = set("ei")
_SILENCE = "sil"


def _base(c: str) -> str:
    """Quita tildes/diéresis: 'á' -> 'a', 'ü' -> 'u'. Mantiene la ñ."""
    c = c.lower()
    if c == "ñ":
        return c
    return unicodedata.normalize("NFD", c)[0]


def _char_visemes(chars: list[str]) -> list[str | None]:
    """Un visema por carácter. None = letra muda (su tiempo se suma al visema anterior)."""
    s = [_base(c) for c in chars]
    out: list[str | None] = []
    for i, c in enumerate(s):
        prev = s[i - 1] if i else ""
        nxt = s[i + 1] if i + 1 < len(s) else ""
        if not c.isalpha():
            out.append(_SILENCE)
        elif c == "h":
            out.append("CH" if prev == "c" else None)  # 'ch' o h muda
        elif c == "c":
            out.append("CH" if nxt == "h" else "SS" if nxt in _FRONT_VOWELS else "kk")
        elif c == "l":
            out.append(None if prev == "l" else "CH" if nxt == "l" else "DD")  # 'll' -> ʝ
        elif c == "r" and prev == "r":
            out.append(None)  # 'rr' ya cubierto por la primera r
        elif c == "u" and prev in ("q", "g") and nxt in _FRONT_VOWELS and chars[i].lower() != "ü":
            out.append(None)  # 'que', 'gui': u muda
        elif c == "y":
            # 'y' vocal (final o ante consonante) vs consonante
            out.append("I" if not nxt.isalpha() or nxt not in "aeiou" else "CH")
        elif c == "x":
            out.append("kk")
        else:
            out.append(_SINGLE.get(c, "DD"))
    return out


def to_visemes(timings: list[CharTiming]) -> list[Viseme]:
    if not timings:
        return []
    labels = _char_visemes([t.char for t in timings])
    out: list[Viseme] = []
    for timing, vis in zip(timings, labels, strict=True):
        dur = max(timing.end - timing.start, 0.0)
        if vis is None or (out and out[-1]["v"] == vis):
            if out:  # letra muda o visema repetido: extiende el anterior
                out[-1]["d"] = round(timing.end - out[-1]["t"], 4)
            continue
        out.append({"t": round(timing.start, 4), "d": round(dur, 4), "v": vis})
    return out
