import type { VoiceCue } from "@/types/simulation";
import type { Viseme } from "@/types/voice";

/**
 * Diálogos de una simulación coreografiada. Cada simulación tiene en su carpeta:
 *  - dialogue.json: el guion (quién dice qué y en qué marca de la coreografía). Lo edita una persona.
 *  - voices.json y voices.ts: duración, visemas y audio de cada línea. Los genera
 *    backend/scripts/generate_dialogue.py con ElevenLabs a partir del guion.
 *  - timeline.json: las marcas (en ms), que exporta el script de Blender junto con las animaciones.
 * Agregar una línea = sumarla al guion y volver a correr el generador.
 */
export interface DialogueScript {
  location: string;
  lines: { id: string; character: string; at: string; offsetMs?: number; text: string }[];
}

export type VoiceManifest = Record<string, { durationMs: number; visemes: { t: number; d: number; v: string }[] }>;

export function buildVoiceCues(
  script: DialogueScript,
  manifest: VoiceManifest,
  sources: Record<string, number>,
  markers: Record<string, number>,
): VoiceCue[] {
  const cues = script.lines.map((line) => {
    const marker = markers[line.at];
    if (marker === undefined) throw new Error(`Diálogo '${line.id}': la coreografía no tiene la marca '${line.at}'`);
    const audio = manifest[line.id];
    const source = sources[line.id];
    if (!audio || source === undefined) {
      throw new Error(`Falta la voz de '${line.id}': corre backend/scripts/generate_dialogue.py`);
    }
    return {
      id: line.id,
      character: line.character,
      atMs: marker + (line.offsetMs ?? 0),
      durationMs: audio.durationMs,
      source,
      visemes: audio.visemes as Viseme[],
    };
  });
  cues.sort((a, b) => a.atMs - b.atMs);
  if (__DEV__) {
    // Dos personajes hablando a la vez no se entienden: avisa para correr el offset en el guion
    cues.slice(1).forEach((cue, i) => {
      const prev = cues[i];
      if (prev.atMs + prev.durationMs > cue.atMs) {
        console.warn(`[diálogo] '${cue.id}' empieza antes de que termine '${prev.id}'`);
      }
    });
  }
  return cues;
}
