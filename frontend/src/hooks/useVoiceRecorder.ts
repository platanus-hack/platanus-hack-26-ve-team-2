import { RecordingPresets, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { useCallback, useRef } from "react";

import type { AudioFile } from "@/types/voice";

// Por debajo de esto es un toque accidental, no una pregunta
const MIN_DURATION_MS = 500;

/** Push-to-talk: `start()` al presionar, `stop()` al soltar → archivo listo para subir. */
export function useVoiceRecorder() {
  // LOW_QUALITY: m4a/AAC 64 kbps, sobra para reconocimiento de voz y sube rápido
  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const startedAt = useRef(0);
  // Si el usuario suelta antes de que termine de prepararse, stop() espera a que arranque
  const starting = useRef<Promise<void> | null>(null);

  const start = useCallback(() => {
    starting.current = (async () => {
      // iOS: sin allowsRecording la grabación falla en silencio
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAt.current = Date.now();
    })();
    return starting.current;
  }, [recorder]);

  /** `null` si fue un toque demasiado corto. */
  const stop = useCallback(async (): Promise<AudioFile | null> => {
    await starting.current;
    starting.current = null;
    await recorder.stop();
    // iOS: con allowsRecording activo la respuesta sonaría por el auricular, no por el altavoz
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    const uri = recorder.uri;
    if (!uri || Date.now() - startedAt.current < MIN_DURATION_MS) return null;
    return { uri, name: "pregunta.m4a", type: "audio/m4a" };
  }, [recorder]);

  return { start, stop };
}
