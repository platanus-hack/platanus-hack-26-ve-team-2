// Espejo de backend/app/schemas/voice.py

export interface Character {
  id: string;
  name: string;
  greeting: string;
}

export interface VoiceLocation {
  id: string;
  name: string;
  characters: Character[];
}

/** Visemas Oculus/Meta (15) para lipsync. */
export type VisemeId =
  | "sil" | "PP" | "FF" | "TH" | "DD" | "kk" | "CH" | "SS" | "nn" | "RR" | "aa" | "E" | "I" | "O" | "U";

export interface Viseme {
  /** Inicio en segundos */
  t: number;
  /** Duración en segundos */
  d: number;
  v: VisemeId;
}

export interface Speech {
  text: string;
  audio_b64: string;
  audio_mime: string;
  duration_s: number;
  visemes: Viseme[];
}

export interface SessionCreate {
  location_id: string;
  character_id: string;
}

export interface VoiceSession {
  session_id: string;
  location_id: string;
  character_id: string;
  expires_in_s: number;
  greeting: Speech;
}

export interface Turn {
  /** Lo que entendió el STT (null si se envió texto) */
  transcript: string | null;
  reply_text: string;
  speech: Speech;
  timings_ms: Record<string, number>;
}

/** Audio grabado en el dispositivo, listo para enviarse como multipart. */
export interface AudioFile {
  uri: string;
  name: string;
  type: string;
}

/** Captura local de lo que enfoca la cámara ("¿qué es esto?"). */
export interface ImageFile {
  uri: string;
  name: string;
  type: string;
}

/**
 * Lo que la app hace cuando el personaje termina de hablar. Hoy: el presentador lanza una escena
 * que el visitante pidió por voz ("háblame de la pérdida del castillo de San Felipe").
 */
export type SimulationAction = { type: "start_simulation"; simulation_id: string };

/** Respuesta de POST /simulations/{id}/ask (espejo de backend/app/schemas/simulation.py). */
export interface SimulationTurn extends Turn {
  /** Envíalo en la próxima pregunta para conservar el hilo de la conversación */
  session_id: string;
  simulation_id: string;
  character_id: string;
  character_name: string;
  /** null: no hay nada que hacer después de la respuesta */
  action: SimulationAction | null;
}

/** Mensajes del servidor en WS /simulations/{id}/ws: la respuesta llega frase por frase. */
export type SimulationWsMessage =
  | { type: "session"; session_id: string }
  | { type: "transcript"; text: string }
  /** "¿Qué es esto?": el servidor espera la captura de la cámara en clientApi.simulations.look */
  | { type: "look"; look_id: string }
  /** Llega antes que el audio; se ejecuta cuando el personaje termina de hablar */
  | { type: "action"; action: SimulationAction }
  | ({ type: "speech"; index: number } & Speech)
  | { type: "reply"; text: string }
  | { type: "turn_end"; timings_ms: Record<string, number> }
  | { type: "error"; code: string; message: string };
