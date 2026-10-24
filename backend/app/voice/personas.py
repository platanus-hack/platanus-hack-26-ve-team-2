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


class PersonaCatalog:
    def __init__(self, locations: dict[str, Location], system_template: str) -> None:
        self.locations = locations
        self._template = _env.from_string(system_template)

    @classmethod
    def from_yaml(cls, path: Path) -> "PersonaCatalog":
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
        locations = {}
        for loc_id, loc in raw["locations"].items():
            chars = {cid: Character(id=cid, **c) for cid, c in loc.pop("characters").items()}
            locations[loc_id] = Location(id=loc_id, characters=chars, **loc)
        return cls(locations, raw["system_template"])

    def get(self, location_id: str, character_id: str) -> tuple[Location, Character]:
        try:
            loc = self.locations[location_id]
            return loc, loc.characters[character_id]
        except KeyError:
            raise UnknownCharacterError(
                f"Personaje '{character_id}' no existe en '{location_id}'"
            ) from None

    def system_prompt(self, loc: Location, char: Character, context: str | None = None) -> str:
        """`context` reemplaza el contexto de la ubicación (p. ej. el prompt de una simulación)."""
        others = [c.name for c in loc.characters.values() if c.id != char.id]
        return self._template.render(
            location=loc, character=char, others=others, context=context or loc.context
        )
