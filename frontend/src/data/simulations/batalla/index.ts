import clash from "@/assets/sounds/battle/clash.mp3";
import clash2 from "@/assets/sounds/battle/clash_2.mp3";
import clashHeavy from "@/assets/sounds/battle/clash_heavy.mp3";
import cry from "@/assets/sounds/battle/cry.mp3";
import draw from "@/assets/sounds/battle/draw.mp3";
import fall from "@/assets/sounds/battle/fall.mp3";
import fanfare from "@/assets/sounds/battle/fanfare.mp3";
import push from "@/assets/sounds/battle/push.mp3";
import runAway from "@/assets/sounds/battle/run_away.mp3";
import runIn from "@/assets/sounds/battle/run_in.mp3";
import type { Choreography } from "@/types/simulation";

import { buildVoiceCues } from "../dialogue";
import dialogue from "./dialogue.json";
// Duración, momentos de cada efecto y marcas: los escribe scripts/battle/build_battle.py junto con las animaciones
import timeline from "./timeline.json";
import voices from "./voices.json";
import { voiceSources } from "./voices";

/**
 * Batalla entre Bolívar y Monteverde: Monteverde llega corriendo, cruzan sables, se empujan,
 * Monteverde desarma a Bolívar, que cae, le responde desde el suelo, se levanta y huye. Al terminar
 * caen globos de los sponsors. Los diálogos están en dialogue.json (ver ../dialogue.ts).
 */
export const battleChoreography: Choreography = {
  animation: timeline.animation,
  durationMs: timeline.durationMs,
  cues: timeline.cues,
  sounds: {
    run_in: runIn,
    draw,
    cry,
    clash,
    clash_2: clash2,
    clash_heavy: clashHeavy,
    push,
    fall,
    run_away: runAway,
    fanfare,
  },
  finale: { sound: "fanfare" },
  voices: buildVoiceCues(dialogue, voices, voiceSources, timeline.markers),
};
