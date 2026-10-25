import { File } from "expo-file-system";
import { useCallback, useEffect, useRef, useState } from "react";

import { clientApi } from "@/api";
import type { ApiError } from "@/api";
import type {
  AudioFile,
  ImageFile,
  SimulationAction,
  SimulationTurn,
  SimulationWsMessage,
  VisemeId,
} from "@/types/voice";

import { useSpeechPlayer } from "./useSpeechPlayer";
import { useVoiceRecorder } from "./useVoiceRecorder";

export type ConversationPhase = "idle" | "recording" | "sending" | "speaking";
type Phase = Exclude<ConversationPhase, "speaking">;

/** Lo que la pantalla necesita del último turno (llega antes que el audio por el WebSocket). */
export type LastTurn = Pick<SimulationTurn, "transcript">;

// Sin ningún mensaje del turno en este tiempo, se da por perdido (STT + primera frase ~2-4 s)
const TURN_TIMEOUT_MS = 30_000;
const RECONNECT_DELAY_MS = [500, 1_000, 2_000, 5_000];
// "¿Qué es esto?": la captura tomada al soltar el botón sirve si el servidor la pide antes de esto
const FRAME_MAX_AGE_MS = 15_000;

/** Borra una captura local que ya no se va a usar. */
function deleteFrame(image: ImageFile | null) {
  try {
    const file = image && new File(image.uri);
    if (file?.exists) file.delete();
  } catch (e) {
    if (__DEV__) console.warn("[Mirar] no se pudo borrar la captura", e);
  }
}

function errorMessage(code: string | undefined, message: string): string {
  return code === "no_speech" ? "No te escuché bien, inténtalo de nuevo." : message;
}

/**
 * `captureFrame` toma una captura de lo que enfoca la cámara: si la pregunta es "¿qué es esto?" el
 * personaje la mira. Se toma al soltar el botón (todavía apunta a lo que preguntó) y solo se sube si
 * el servidor la pide; si esa no se pudo tomar, se toma otra al llegar el aviso.
 *
 * Conversación push-to-talk con el personaje de una simulación:
 * presionar → grabar · soltar → enviar audio + simulation_id → reproducir respuesta con lipsync.
 * `onViseme` recibe el visema que suena en cada cambio (para mover la boca sin re-renderizar).
 *
 * Va por WebSocket: la sesión se abre al montar (la primera pregunta no espera eso) y la respuesta
 * llega frase por frase, así el personaje empieza a hablar con la primera. Si el WebSocket no está
 * conectado, usa POST /ask (respuesta completa de una vez).
 *
 * `action`: lo que pidió el personaje en su respuesta (p. ej. abrir una escena). Queda disponible
 * cuando el turno terminó y la pantalla la ejecuta al terminar de hablar, con `takeAction`. Hablarle
 * de nuevo antes la descarta.
 */
export function useSimulationConversation(
  simulationId: string,
  onViseme?: (viseme: VisemeId) => void,
  captureFrame?: () => Promise<ImageFile | null>,
) {
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
  // El personaje está mirando la captura (entre el aviso "look" y su respuesta)
  const [looking, setLooking] = useState(false);
  const sessionId = useRef<string | null>(null);
  // La acción llega antes que el audio: se guarda aquí hasta que el turno termina
  const pendingAction = useRef<SimulationAction | null>(null);
  // Lista para ejecutarse; anotada con su simulación: al cambiar de simulación deja de valer
  const [ready, setReady] = useState<{ simulationId: string; action: SimulationAction } | null>(null);
  const action = ready?.simulationId === simulationId ? ready.action : null;
  const setAction = useCallback(
    (next: SimulationAction | null) => setReady(next && { simulationId, action: next }),
    [simulationId],
  );
  const clearAction = useCallback(() => {
    pendingAction.current = null;
    setReady(null);
  }, []);
  /** La acción lista para ejecutarse, que deja de estarlo. */
  const takeAction = useCallback(() => {
    clearAction();
    return action;
  }, [action, clearAction]);

  const captureRef = useRef(captureFrame);
  useEffect(() => {
    captureRef.current = captureFrame;
  });
  // Última captura tomada al soltar el botón, a la espera de que el servidor la pida
  const frame = useRef<{ promise: Promise<ImageFile | null>; at: number } | null>(null);

  const capture = useCallback(
    (): Promise<ImageFile | null> =>
      captureRef.current?.().catch((e: unknown) => {
        if (__DEV__) console.warn("[Mirar] no se pudo tomar la captura", e);
        return null;
      }) ?? Promise.resolve(null),
    [],
  );

  /** La captura guardada (si sigue fresca), que deja de estar guardada. */
  const takeStoredFrame = useCallback(async (): Promise<ImageFile | null> => {
    const stored = frame.current;
    frame.current = null;
    if (!stored) return null;
    const image = await stored.promise;
    if (Date.now() - stored.at < FRAME_MAX_AGE_MS) return image;
    deleteFrame(image);
    return null;
  }, []);

  const discardStoredFrame = useCallback(() => {
    void takeStoredFrame().then(deleteFrame);
  }, [takeStoredFrame]);

  // El servidor pidió la captura: la del momento de la pregunta o, si no hay, una nueva
  const sendFrame = useCallback(
    async (lookId: string) => {
      const image = (await takeStoredFrame()) ?? (await capture());
      if (__DEV__) console.log("[Mirar] el servidor pidió la captura", lookId, image?.uri ?? "sin captura");
      // Sin captura el servidor deja de esperarla y el personaje pide que apunte la cámara
      if (!image) return;
      const startedAt = Date.now();
      try {
        await clientApi.simulations.look(simulationId, lookId, image);
        if (__DEV__) {
          const kb = Math.round(new File(image.uri).size / 1024);
          console.log("[Mirar] captura subida", `${kb} KB en ${Date.now() - startedAt} ms`);
        }
      } catch (e) {
        console.warn("[Mirar] no se pudo subir la captura", e);
      } finally {
        deleteFrame(image);
      }
    },
    [capture, simulationId, takeStoredFrame],
  );

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
        setLooking(false);
        pendingTurns.current = Math.max(0, pendingTurns.current - 1);
        if (stale) {
          staleTurns.current -= 1;
          return;
        }
        clearTurnTimer();
        // No era "¿qué es esto?": la captura del momento de la pregunta ya no hace falta
        discardStoredFrame();
        if (__DEV__ && msg.type === "turn_end") console.log("[Voz] turno", msg.timings_ms);
        if (msg.type === "error") setError(errorMessage(msg.code, msg.message));
        // Con el turno completo (todas las frases en cola) la acción queda lista; si falló, se descarta
        setAction(msg.type === "turn_end" ? pendingAction.current : null);
        pendingAction.current = null;
        if (phaseRef.current === "sending") setPhase("idle");
        return;
      }
      if (stale) return;
      if (msg.type === "transcript") {
        setLastTurn({ transcript: msg.text });
      } else if (msg.type === "action") {
        if (__DEV__) console.log("[Voz] acción", msg.action);
        pendingAction.current = msg.action;
      } else if (msg.type === "look") {
        setLooking(true);
        void sendFrame(msg.look_id);
      } else if (msg.type === "speech") {
        setLooking(false);
        speech.enqueue(msg);
        // Desde la primera frase la fase es "speaking" (derivada del reproductor)
        if (phaseRef.current === "sending") setPhase("idle");
      }
    },
    [clearTurnTimer, setPhase, speech, sendFrame, discardStoredFrame, setAction],
  );

  // El socket vive más que un render: lee siempre el handler actual
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  // Otra simulación = otro personaje/prompt: la conversación empieza de cero, con su propio socket
  useEffect(() => {
    sessionId.current = null;
    pendingAction.current = null;
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
    clearAction(); // y lo que iba a hacer al terminar
    setError(null);
    setPhase("recording");
    try {
      await recorder.start();
    } catch {
      setPhase("idle");
      setError("No se pudo acceder al micrófono.");
    }
  }, [setPhase, recorder, speech, discardPending, clearAction]);

  const askRest = useCallback(
    async (audio: AudioFile) => {
      // Por REST la captura viaja con la pregunta: el servidor solo la mira si es "¿qué es esto?"
      const image = await takeStoredFrame();
      try {
        const turn = await clientApi.simulations.ask(simulationId, audio, sessionId.current, image);
        sessionId.current = turn.session_id;
        setLastTurn(turn);
        speech.play(turn.speech);
        setAction(turn.action ?? null);
      } catch (e) {
        const apiError = e as ApiError;
        setError(apiError.isConnectionError ? "Sin conexión con el servidor." : errorMessage(apiError.code, apiError.message));
      } finally {
        deleteFrame(image);
        setPhase("idle");
      }
    },
    [setPhase, simulationId, speech, takeStoredFrame, setAction],
  );

  const stopTalking = useCallback(async () => {
    if (phaseRef.current !== "recording") return;
    // La captura, ya: mientras el servidor transcribe el visitante puede mover el teléfono
    discardStoredFrame();
    frame.current = { promise: capture(), at: Date.now() };
    let audio;
    try {
      audio = await recorder.stop();
    } catch {
      setPhase("idle");
      setError("No se pudo grabar el audio.");
      return;
    }
    if (!audio) {
      discardStoredFrame();
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
  }, [setPhase, recorder, askRest, clearTurnTimer, discardPending, capture, discardStoredFrame]);

  return {
    phase: (speech.playing && phase === "idle" ? "speaking" : phase) as ConversationPhase,
    lastTurn,
    error,
    looking,
    action,
    takeAction,
    startTalking,
    stopTalking,
  };
}
