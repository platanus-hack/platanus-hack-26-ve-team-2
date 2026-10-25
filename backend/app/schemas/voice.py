import base64
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field

from app.voice.service import SpeechEvent

# ids de personas.yaml: slugs simples, nunca rutas ni texto libre.
Slug = Annotated[str, Field(pattern=r"^[a-z0-9_]{1,64}$")]
VisemeId = Literal[
    "sil", "PP", "FF", "TH", "DD", "kk", "CH", "SS", "nn", "RR", "aa", "E", "I", "O", "U"
]


# ---------- catálogo ----------


class CharacterOut(BaseModel):
    id: str
    name: str
    greeting: str


class LocationOut(BaseModel):
    id: str
    name: str
    characters: list[CharacterOut]


# ---------- audio + lipsync ----------


class VisemeOut(BaseModel):
    t: float = Field(description="Inicio en segundos")
    d: float = Field(description="Duración en segundos")
    v: VisemeId = Field(description="Visema Oculus/Meta (15)")


class SpeechOut(BaseModel):
    text: str
    audio_b64: str
    audio_mime: str
    duration_s: float
    visemes: list[VisemeOut]

    @classmethod
    def from_event(cls, e: SpeechEvent) -> "SpeechOut":
        return cls(
            text=e.text,
            audio_b64=base64.b64encode(e.audio).decode(),
            audio_mime=e.mime_type,
            duration_s=e.duration_s,
            visemes=[VisemeOut(**v) for v in e.visemes],
        )


# ---------- REST ----------


class SessionCreate(BaseModel):
    location_id: Slug
    character_id: Slug


class SessionOut(BaseModel):
    session_id: str
    location_id: str
    character_id: str
    expires_in_s: int
    greeting: SpeechOut


class TurnOut(BaseModel):
    transcript: str | None = Field(description="Lo que entendió el STT (null si se envió texto)")
    reply_text: str
    speech: SpeechOut
    timings_ms: dict[str, int]
    action: dict[str, Any] | None = Field(
        default=None,
        description="Lo que la app debe hacer al terminar de hablar el personaje (null: nada)",
    )


# ---------- WebSocket: mensajes del cliente ----------


class WsStart(BaseModel):
    type: Literal["start"]
    location_id: Slug
    character_id: Slug


class WsAudioEnd(BaseModel):
    """Cierra el audio enviado en frames binarios desde el último turno."""

    type: Literal["audio_end"]
    mime_type: str = Field(default="audio/webm", max_length=64)


class WsText(BaseModel):
    type: Literal["text"]
    text: str = Field(min_length=1, max_length=2000)


class WsEnd(BaseModel):
    type: Literal["end"]


WsClientMessage = Annotated[WsStart | WsAudioEnd | WsText | WsEnd, Field(discriminator="type")]
