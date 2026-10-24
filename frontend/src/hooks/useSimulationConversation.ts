import { File } from "expo-file-system";
import { useCallback, useEffect, useRef, useState } from "react";

import { clientApi } from "@/api";
import type { ApiError } from "@/api";
import type { AudioFile, SimulationTurn, SimulationWsMessage, VisemeId } from "@/types/voice";

import { useSpeechPlayer } from "./useSpeechPlayer";
import { useVoiceRecorder } from "./useVoiceRecorder";

export type ConversationPhase = "idle" | "recording" | "sending" | "speaking";
type Phase = Exclude<ConversationPhase, "speaking">;

/** Lo que la pantalla necesita del último turno (llega antes que el audio por el WebSocket). */
export type LastTurn = Pick<SimulationTurn, "transcript">;

// Sin ningún mensaje del turno en este tiempo, se da por perdido (STT + primera frase ~2-4 s)
const TURN_TIMEOUT_MS = 30_000;
const RECONNECT_DELAY_MS = [500, 1_000, 2_000, 5_000];

function errorMessage(code: string | undefined, message: string): string {
  return code === "no_speech" ? "No te escuché bien, inténtalo de nuevo." : message;
}

/**
 * Conversación push-to-talk con el personaje de una simulación:
 * presionar → grabar · soltar → enviar audio + simulation_id → reproducir respuesta con lipsync.
 * `onViseme` recibe el visema que suena en cada cambio (para mover la boca sin re-renderizar).
 *
 * Va por WebSocket: la sesión se abre al montar (la primera pregunta no espera eso) y la respuesta
 * llega frase por frase, así el personaje empieza a hablar con la primera. Si el WebSocket no está
 * conectado, usa POST /ask (respuesta completa de una vez).
 */
export function useSimulationConversation(simulationId: string, onViseme?: (viseme: VisemeId) => void) {
  const recorder = useVoiceRecorder();
  const speech = useSpeechPlayer(onViseme);
  const [phase, setPhaseState] = useState<Phase>("idle");
  // Los gestos llegan más rápido que los renders: la fase real vive en un ref
  const phaseRef = useRef<Phase>("idle");
  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);
  const [lastTurn, setLastTurn] = useState<LastTurn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionId = useRef<string | null>(null);

  const ws = useRef<WebSocket | null>(null);
  // Turnos enviados por el WebSocket que aún no terminaron. El servidor los responde en orden, así
  // que los primeros `staleTurns` son de preguntas interrumpidas: lo que llegue de ellos se descarta
  const pendingTurns = useRef(0);
  const staleTurns = useRef(0);
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTurnTimer = useCallback(() => {
    if (turnTimer.current) clearTimeout(turnTimer.current);
    turnTimer.current = null;
  }, []);

  const resetTurns = useCallback(() => {
    pendingTurns.current = 0;
    staleTurns.current = 0;
    clearTurnTimer();
  }, [clearTurnTimer]);

  /** Todo lo pendiente pasa a descartarse (interrupción o timeout). */
  const discardPending = useCallback(() => {
    staleTurns.current = pendingTurns.current;
    clearTurnTimer();
  }, [clearTurnTimer]);

  const onMessage = useCallback(
    (msg: SimulationWsMessage) => {
      if (msg.type === "session") {
        sessionId.current = msg.session_id;
        return;
      }
      const stale = staleTurns.current > 0;
      if (msg.type === "turn_end" || msg.type === "error") {
        pendingTurns.current = Math.max(0, pendingTurns.current - 1);
        if (stale) {
          staleTurns.current -= 1;
          return;
        }
        clearTurnTimer();
        if (__DEV__ && msg.type === "turn_end") console.log("[Voz] turno", msg.timings_ms);
        if (msg.type === "error") setError(errorMessage(msg.code, msg.message));
        if (phaseRef.current === "sending") setPhase("idle");
        return;
      }
      if (stale) return;
      if (msg.type === "transcript") {
        setLastTurn({ transcript: msg.text });
      } else if (msg.type === "speech") {
        speech.enqueue(msg);
        // Desde la primera frase la fase es "speaking" (derivada del reproductor)
        if (phaseRef.current === "sending") setPhase("idle");
      }
    },
    [clearTurnTimer, setPhase, speech],
  );

  // El socket vive más que un render: lee siempre el handler actual
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  // Otra simulación = otro personaje/prompt: la conversación empieza de cero, con su propio socket
  useEffect(() => {
    sessionId.current = null;
    let closed = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const socket = new WebSocket(clientApi.simulations.wsUrl(simulationId, sessionId.current));
      ws.current = socket;
      socket.onopen = () => {
        attempt = 0;
      };
      socket.onmessage = (e) => {
        try {
          onMessageRef.current(JSON.parse(e.data as string) as SimulationWsMessage);
        } catch (err) {
          console.warn("[Voz] mensaje inválido del servidor", err);
        }
      };
      socket.onclose = () => {
        // Cerrado por el cleanup (desmontaje u otra simulación): el estado ya es del socket nuevo
        if (closed) return;
        if (ws.current === socket) ws.current = null;
        if (pendingTurns.current > staleTurns.current) {
          if (phaseRef.current === "sending") setPhase("idle");
          setError("Se perdió la conexión, inténtalo de nuevo.");
        }
        resetTurns();
        retry = setTimeout(connect, RECONNECT_DELAY_MS[Math.min(attempt++, RECONNECT_DELAY_MS.length - 1)]);
      };
    };
    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws.current?.close();
      ws.current = null;
      resetTurns();
    };
  }, [simulationId, resetTurns, setPhase]);

  const startTalking = useCallback(async () => {
    if (phaseRef.current !== "idle") return;
    speech.stop(); // hablarle encima al personaje lo interrumpe
    discardPending(); // y descarta las frases que faltaban
    setError(null);
    setPhase("recording");
    try {
      await recorder.start();
    } catch {
      setPhase("idle");
      setError("No se pudo acceder al micrófono.");
    }
  }, [setPhase, recorder, speech, discardPending]);

  const askRest = useCallback(
    async (audio: AudioFile) => {
      try {
        const turn = await clientApi.simulations.ask(simulationId, audio, sessionId.current);
        sessionId.current = turn.session_id;
        setLastTurn(turn);
        speech.play(turn.speech);
      } catch (e) {
        const apiError = e as ApiError;
        setError(apiError.isConnectionError ? "Sin conexión con el servidor." : errorMessage(apiError.code, apiError.message));
      } finally {
        setPhase("idle");
      }
    },
    [setPhase, simulationId, speech],
  );

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
    const socket = ws.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      await askRest(audio);
      return;
    }
    try {
      const bytes = await new File(audio.uri).arrayBuffer();
      socket.send(bytes);
      socket.send(JSON.stringify({ type: "audio_end", mime_type: audio.type }));
      pendingTurns.current += 1;
      clearTurnTimer();
      turnTimer.current = setTimeout(() => {
        // El servidor puede seguir con este turno: lo que llegue después se descarta
        discardPending();
        if (phaseRef.current === "sending") setPhase("idle");
        setError("El servidor tardó demasiado, inténtalo de nuevo.");
      }, TURN_TIMEOUT_MS);
    } catch (e) {
      console.warn("[Voz] no se pudo enviar por WebSocket, se usa /ask", e);
      await askRest(audio);
    }
  }, [setPhase, recorder, askRest, clearTurnTimer, discardPending]);

  return {
    phase: (speech.playing && phase === "idle" ? "speaking" : phase) as ConversationPhase,
    lastTurn,
    error,
    startTalking,
    stopTalking,
  };
}
