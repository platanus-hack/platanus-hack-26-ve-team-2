import cry from "@/assets/sounds/battle/cry.mp3";
import fall from "@/assets/sounds/battle/fall.mp3";
import fanfare from "@/assets/sounds/battle/fanfare.mp3";
import runAway from "@/assets/sounds/battle/run_away.mp3";
import disparo from "@/assets/sounds/trenches/disparo.mp3";
import disparo2 from "@/assets/sounds/trenches/disparo_2.mp3";
import type { Choreography, Vec3 } from "@/types/simulation";

// Puestos, parapetos, duración y cada disparo (con la posición de la boca del fusil): los escribe
// scripts/trenches/build_trenches.py junto con las animaciones, igual que simulations/batalla/timeline.json
import timeline from "./trenches.json";

export interface TrenchSlot {
  id: string;
  side: "patriota" | "realista";
  /** a–d: variante de la animación ("trincheras_a"…) */
  variant: string;
  /** En el marco del campo: origen entre las trincheras, +Z hacia el usuario, +X a su derecha */
  position: Vec3;
  yaw: number;
}

export interface TrenchParapet {
  id: string;
  position: Vec3;
  yaw: number;
}

export const TRENCH_SLOTS = timeline.slots as TrenchSlot[];
export const TRENCH_PARAPETS = timeline.parapets as TrenchParapet[];

/**
 * Trincheras de La Victoria (1814): patriotas a la izquierda del usuario y realistas a la derecha,
 * cada bando tras su parapeto, se disparan por descargas. Al terminar caen los globos.
 */
export const trenchesChoreography: Choreography = {
  animation: timeline.animation,
  layout: "field",
  durationMs: timeline.durationMs,
  cues: timeline.cues as Choreography["cues"],
  sounds: {
    disparo,
    disparo_2: disparo2,
    cry,
    fall,
    run_away: runAway,
    fanfare,
  },
  finale: { sound: "fanfare" },
};
