import type { AudioFile, SimulationTurn } from "@/types/voice";

import { http } from "../client";
import { toFormDataFile } from "../upload";

// STT + LLM + TTS en un solo request
const ASK_TIMEOUT_MS = 60_000;

export const SimulationsModule = {
  /**
   * Pregunta por voz al personaje de la simulación. El servidor resuelve el prompt del sitio
   * a partir de `simulationId`; la respuesta trae audio + visemas para el lipsync.
   */
  ask: (simulationId: string, audio: AudioFile, sessionId?: string | null) => {
    const form = new FormData();
    form.append("audio", toFormDataFile(audio));
    if (sessionId) form.append("session_id", sessionId);
    return http.post<SimulationTurn>(`/simulations/${encodeURIComponent(simulationId)}/ask`, form, {
      timeoutMs: ASK_TIMEOUT_MS,
    });
  },
};
