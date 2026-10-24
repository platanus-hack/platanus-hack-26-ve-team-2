"""Ubicaciones/personajes (personas.yaml) y render del system prompt con Jinja2."""

from dataclasses import dataclass
from pathlib import Path

import yaml
from jinja2 import StrictUndefined
from jinja2.sandbox import SandboxedEnvironment

from app.voice.errors import UnknownCharacterError

# Sandbox: el template viene de un archivo de configuración, no debe poder ejecutar código.
_env = SandboxedEnvironment(undefined=StrictUndefined, trim_blocks=True, lstrip_blocks=True)


@dataclass(frozen=True, slots=True)
class Character:
    id: str
    name: str
    voices: dict[str, str]  # proveedor TTS -> voice_id
    persona: str
    greeting: str


@dataclass(frozen=True, slots=True)
class Location:
    id: str
    name: str
    context: str
    keyterms: list[str]
    characters: dict[str, Character]
    # El personaje conoce toda la historia hasta hoy (no solo su época), p. ej. Bolívar presentador
    knows_history: bool = False


@dataclass(frozen=True, slots=True)
class Landmarks:
    """Lugares y objetos emblemáticos de un personaje (landmarks.yaml), para reconocerlos."""

    character_id: str
    places: list[dict[str, str]]
    objects: list[dict[str, str]]


class PersonaCatalog:
    def __init__(
        self,
        locations: dict[str, Location],
        system_template: str,
        landmarks: Landmarks | None = None,
    ) -> None:
        self.locations = locations
        self._template = _env.from_string(system_template)
        self._landmarks = landmarks

    @classmethod
    def from_yaml(cls, path: Path) -> "PersonaCatalog":
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
        locations = {}
        for loc_id, loc in raw["locations"].items():
            chars = {cid: Character(id=cid, **c) for cid, c in loc.pop("characters").items()}
            locations[loc_id] = Location(id=loc_id, characters=chars, **loc)
        # Los emblemáticos van en su propio archivo, junto a personas.yaml
        landmarks = None
        landmarks_path = path.with_name("landmarks.yaml")
        if landmarks_path.exists():
            lm = yaml.safe_load(landmarks_path.read_text(encoding="utf-8"))
            landmarks = Landmarks(lm["personaje"], lm["lugares"], lm["objetos"])
        return cls(locations, raw["system_template"], landmarks)

    def get(self, location_id: str, character_id: str) -> tuple[Location, Character]:
        try:
            loc = self.locations[location_id]
            return loc, loc.characters[character_id]
        except KeyError:
            raise UnknownCharacterError(
                f"Personaje '{character_id}' no existe en '{location_id}'"
            ) from None

    def system_prompt(
        self, loc: Location, char: Character, context: str | None = None, looking: bool = False
    ) -> str:
        """`context` reemplaza el contexto de la ubicación (p. ej. el prompt de una simulación).
        `looking`: el personaje ya mira la captura de la cámara (sin la regla de pedirla)."""
        others = [c.name for c in loc.characters.values() if c.id != char.id]
        landmarks = (
            self._landmarks if self._landmarks and self._landmarks.character_id == char.id else None
        )
        return self._template.render(
            location=loc,
            character=char,
            others=others,
            context=context or loc.context,
            landmarks=landmarks,
            looking=looking,
        )
