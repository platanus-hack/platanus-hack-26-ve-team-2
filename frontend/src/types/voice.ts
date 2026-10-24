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
