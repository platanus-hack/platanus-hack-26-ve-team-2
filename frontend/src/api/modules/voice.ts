import { Environment } from "@/config/environment";
import type { AudioFile, SessionCreate, Turn, VoiceLocation, VoiceSession } from "@/types/voice";

import { http } from "../client";

// STT + LLM + TTS en un solo request: más lento que el resto de la API
const TURN_TIMEOUT_MS = 60_000;

export const VoiceModule = {
  locations: () => http.get<VoiceLocation[]>("/voice/locations"),

  /** Al entrar en rango: crea la sesión y devuelve el saludo del personaje en audio. */
  createSession: (payload: SessionCreate) =>
    http.post<VoiceSession>("/voice/sessions", payload, { timeoutMs: TURN_TIMEOUT_MS }),

  /** Un turno de conversación: audio grabado o texto. */
  sendTurn: (sessionId: string, input: { audio: AudioFile } | { text: string }) => {
    const form = new FormData();
    if ("audio" in input) {
      // React Native acepta { uri, name, type } como archivo en FormData
      form.append("audio", input.audio as unknown as Blob);
    } else {
      form.append("text", input.text);
    }
    return http.post<Turn>(`/voice/sessions/${encodeURIComponent(sessionId)}/turns`, form, {
      timeoutMs: TURN_TIMEOUT_MS,
    });
  },

  /** Al salir de rango: libera la sesión (idempotente). */
  endSession: (sessionId: string) => http.delete(`/voice/sessions/${encodeURIComponent(sessionId)}`),

  /** URL del WebSocket de streaming por etapas (transcript, reply, speech). */
  wsUrl: () => `${Environment.WS_BASE_URL}/voice/ws`,
};
