import { useCallback, useEffect, useRef, useState } from "react";

import { clientApi } from "@/api";
import type { ApiError } from "@/api";
import type { SimulationTurn } from "@/types/voice";

import { useSpeechPlayer } from "./useSpeechPlayer";
import { useVoiceRecorder } from "./useVoiceRecorder";

export type ConversationPhase = "idle" | "recording" | "sending" | "speaking";
type Phase = Exclude<ConversationPhase, "speaking">;

/**
 * Conversación push-to-talk con el personaje de una simulación:
 * presionar → grabar · soltar → enviar audio + simulation_id → reproducir respuesta con lipsync.
 */
export function useSimulationConversation(simulationId: string) {
  const recorder = useVoiceRecorder();
  const speech = useSpeechPlayer();
  const [phase, setPhaseState] = useState<Phase>("idle");
  // Los gestos llegan más rápido que los renders: la fase real vive en un ref
  const phaseRef = useRef<Phase>("idle");
  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);
  const [lastTurn, setLastTurn] = useState<SimulationTurn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionId = useRef<string | null>(null);

  // Otra simulación = otro personaje/prompt: la conversación empieza de cero
  useEffect(() => {
    sessionId.current = null;
  }, [simulationId]);

  const startTalking = useCallback(async () => {
    if (phaseRef.current !== "idle") return;
    speech.stop(); // hablarle encima al personaje lo interrumpe
    setError(null);
    setPhase("recording");
    try {
      await recorder.start();
    } catch {
      setPhase("idle");
      setError("No se pudo acceder al micrófono.");
    }
  }, [setPhase, recorder, speech]);

  const stopTalking = useCallback(async () => {
    if (phaseRef.current !== "recording") return;
    let audio;
    try {
      audio = await recorder.stop();
    } catch {
      setPhase("idle");
      setError("No se pudo grabar el audio.");
      return;
    }
    if (!audio) {
      setPhase("idle");
      setError("Mantén presionado mientras hablas.");
      return;
    }

    setPhase("sending");
    try {
      const turn = await clientApi.simulations.ask(simulationId, audio, sessionId.current);
      sessionId.current = turn.session_id;
      setLastTurn(turn);
      speech.play(turn.speech);
    } catch (e) {
      const apiError = e as ApiError;
      setError(
        apiError.code === "no_speech"
          ? "No te escuché bien, inténtalo de nuevo."
          : apiError.isConnectionError
            ? "Sin conexión con el servidor."
            : apiError.message,
      );
    } finally {
      setPhase("idle");
    }
  }, [setPhase, recorder, simulationId, speech]);

  return {
    phase: (speech.playing && phase === "idle" ? "speaking" : phase) as ConversationPhase,
    viseme: speech.viseme,
    lastTurn,
    error,
    startTalking,
    stopTalking,
  };
}
