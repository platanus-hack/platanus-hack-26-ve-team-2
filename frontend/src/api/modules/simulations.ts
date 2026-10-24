import { Environment } from "@/config/environment";
import type { AudioFile, ImageFile, SimulationTurn } from "@/types/voice";

import { http } from "../client";
import { toFormDataFile } from "../upload";

// STT + LLM + TTS en un solo request
const ASK_TIMEOUT_MS = 60_000;
// El servidor espera la captura unos segundos: más tarde ya no sirve
const LOOK_TIMEOUT_MS = 8_000;

export const SimulationsModule = {
  /**
   * Pregunta por voz al personaje de la simulación. El servidor resuelve el prompt del sitio
   * a partir de `simulationId`; la respuesta trae audio + visemas para el lipsync.
   */
  ask: (simulationId: string, audio: AudioFile, sessionId?: string | null, image?: ImageFile | null) => {
    const form = new FormData();
    form.append("audio", toFormDataFile(audio));
    if (sessionId) form.append("session_id", sessionId);
    // Por si pregunta "¿qué es esto?": el servidor solo la mira en ese caso
    if (image) form.append("image", toFormDataFile(image));
    return http.post<SimulationTurn>(`/simulations/${encodeURIComponent(simulationId)}/ask`, form, {
      timeoutMs: ASK_TIMEOUT_MS,
    });
  },

  /**
   * Captura de lo que enfoca la cámara, pedida por el WebSocket ({type: "look"}): el personaje la
   * mira y responde en el mismo turno.
   */
  look: (simulationId: string, lookId: string, image: ImageFile) => {
    const form = new FormData();
    form.append("image", toFormDataFile(image));
    return http.post<void>(
      `/simulations/${encodeURIComponent(simulationId)}/look/${encodeURIComponent(lookId)}`,
      form,
      { timeoutMs: LOOK_TIMEOUT_MS },
    );
  },

  /**
   * WebSocket de la conversación (más rápido que `ask`): la sesión se abre al conectar y la
   * respuesta llega frase por frase. `sessionId` retoma el hilo si sigue vivo.
   */
  wsUrl: (simulationId: string, sessionId?: string | null) => {
    const base = `${Environment.WS_BASE_URL}/simulations/${encodeURIComponent(simulationId)}/ws`;
    return sessionId ? `${base}?session_id=${encodeURIComponent(sessionId)}` : base;
  },
};
