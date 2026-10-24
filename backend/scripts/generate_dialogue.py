"""Genera con ElevenLabs las voces del guion de una simulación y las deja listas para la app.

Lee el guion (frontend/src/data/simulations/<simulación>/dialogue.json): quién dice cada línea, qué
dice y en qué marca de la coreografía. La voz de cada personaje sale de app/voice/personas.yaml (la
misma que usa en las conversaciones) y los visemas, de app/voice/lipsync.py.

Escribe, para la app:
  - frontend/assets/sounds/<simulación>/voces/<id>.mp3
  - <carpeta del guion>/voices.json: duración, visemas y hash (para no regenerarla) de cada línea
  - <carpeta del guion>/voices.ts: el require de cada mp3 (RN solo empaqueta require estáticos)

Solo pide a ElevenLabs las líneas nuevas o cambiadas (texto, voz, modelo o ajustes); las que ya no
están en el guion se borran.

Uso (desde backend/):
  uv run python scripts/generate_dialogue.py ../frontend/src/data/simulations/batalla/dialogue.json
"""

import argparse
import asyncio
import base64
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from elevenlabs.types import VoiceSettings  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.voice.lipsync import to_visemes  # noqa: E402
from app.voice.personas import PersonaCatalog  # noqa: E402
from app.voice.ports import CharTiming  # noqa: E402
from app.voice.providers.elevenlabs.factory import client  # noqa: E402

FRONTEND = Path(__file__).resolve().parents[2] / "frontend"
OUTPUT_FORMAT = (
    "mp3_44100_128"  # se reproduce desde el teléfono: mejor calidad que la de la conversación
)


def line_hash(line: dict, voice_id: str, model: str) -> str:
    key = {
        "text": line["text"],
        "voice": voice_id,
        "model": model,
        "settings": line.get("voiceSettings"),
        "format": OUTPUT_FORMAT,
    }
    return hashlib.sha256(json.dumps(key, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[
        :16
    ]


async def synthesize(
    line: dict, voice_id: str, model: str, language: str
) -> tuple[bytes, list[CharTiming]]:
    settings = get_settings()
    settings_kw = (
        {"voice_settings": VoiceSettings(**line["voiceSettings"])}
        if line.get("voiceSettings")
        else {}
    )
    result = await client(settings).text_to_speech.convert_with_timestamps(
        voice_id=voice_id,
        text=line["text"],
        model_id=model,
        language_code=language,
        output_format=OUTPUT_FORMAT,
        **settings_kw,
    )
    a = result.alignment
    timings = [
        CharTiming(c, s, e)
        for c, s, e in zip(
            a.characters,
            a.character_start_times_seconds,
            a.character_end_times_seconds,
            strict=True,
        )
    ]
    return base64.b64decode(result.audio_base_64), timings


def write_sources(path: Path, simulation: str, ids: list[str]) -> None:
    imports = "\n".join(
        f'import {i} from "@/assets/sounds/{simulation}/voces/{i}.mp3";' for i in ids
    )
    entries = "\n".join(f"  {i}," for i in ids)
    path.write_text(
        "// Generado por backend/scripts/generate_dialogue.py a partir de dialogue.json: "
        "no editar a mano\n"
        f"{imports}\n\n"
        "/** Audio de cada línea del guion, por id */\n"
        f"export const voiceSources: Record<string, number> = {{\n{entries}\n}};\n",
        encoding="utf-8",
    )


async def main(script_path: Path) -> None:
    script = json.loads(script_path.read_text(encoding="utf-8"))
    folder = script_path.parent
    simulation = folder.name
    audio_dir = FRONTEND / "assets" / "sounds" / simulation / "voces"
    audio_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = folder / "voices.json"
    manifest = (
        json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    )

    settings = get_settings()
    catalog = PersonaCatalog.from_yaml(settings.voice_personas_file)
    model = script.get("model", settings.elevenlabs_tts_model)
    ids = [line["id"] for line in script["lines"]]
    if len(set(ids)) != len(ids):
        sys.exit("Hay ids repetidos en el guion")

    out = {}
    for line in script["lines"]:
        _, character = catalog.get(script["location"], line["character"])
        voice_id = character.voices["elevenlabs"]
        digest = line_hash(line, voice_id, model)
        mp3 = audio_dir / f"{line['id']}.mp3"
        cached = manifest.get(line["id"])
        if cached and cached["hash"] == digest and mp3.exists():
            out[line["id"]] = cached
            print(f"= {line['id']} (sin cambios)")
            continue
        audio, timings = await synthesize(line, voice_id, model, settings.voice_language)
        mp3.write_bytes(audio)
        out[line["id"]] = {
            "hash": digest,
            "durationMs": round(timings[-1].end * 1000) if timings else 0,
            "visemes": to_visemes(timings),
        }
        print(f"+ {line['id']}: {out[line['id']]['durationMs']} ms ({character.name})")

    for stale in set(manifest) - set(out):
        (audio_dir / f"{stale}.mp3").unlink(missing_ok=True)
        print(f"- {stale} (ya no está en el guion)")
    manifest_path.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    write_sources(folder / "voices.ts", simulation, ids)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("script", type=Path, help="dialogue.json de la simulación")
    asyncio.run(main(parser.parse_args().script.resolve()))
