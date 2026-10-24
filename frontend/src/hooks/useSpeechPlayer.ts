import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { File, Paths } from "expo-file-system";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Speech, Viseme, VisemeId } from "@/types/voice";
import { visemeAt } from "@/utils/lipsync";

const EXTENSION_BY_MIME: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
};

/**
 * Reproduce la respuesta del personaje y avisa a `onViseme` cada vez que cambia el visema activo,
 * sincronizado frame a frame. No pasa por el estado de React: re-renderizar la pantalla a ese ritmo
 * hacía que la RA fuera a tirones mientras el personaje habla.
 */
export function useSpeechPlayer(onViseme?: (viseme: VisemeId) => void) {
  const player = useAudioPlayer(null);
  const { playing } = useAudioPlayerStatus(player);
  const [visemes, setVisemes] = useState<Viseme[]>([]);
  const onVisemeRef = useRef(onViseme);
  useEffect(() => {
    onVisemeRef.current = onViseme;
  });
  const fileRef = useRef<File | null>(null);

  const deleteFile = useCallback(() => {
    if (fileRef.current?.exists) fileRef.current.delete();
    fileRef.current = null;
  }, []);

  const play = useCallback(
    (speech: Speech) => {
      deleteFile();
      // El audio llega en base64: se escribe en caché para que el reproductor nativo lo lea
      const ext = EXTENSION_BY_MIME[speech.audio_mime] ?? "mp3";
      const file = new File(Paths.cache, `respuesta-${Date.now()}.${ext}`);
      file.create({ overwrite: true });
      file.write(speech.audio_b64, { encoding: "base64" });
      fileRef.current = file;

      setVisemes(speech.visemes);
      player.replace({ uri: file.uri });
      player.play();
    },
    [player, deleteFile],
  );

  const stop = useCallback(() => player.pause(), [player]);

  // El estado del reproductor se emite cada 500 ms: muy lento para la boca. Se lee el tiempo
  // en cada frame mientras suena y solo se avisa cuando el visema cambia; al terminar, boca cerrada
  useEffect(() => {
    if (!playing || visemes.length === 0) return;
    let last: VisemeId | null = null;
    let frame = requestAnimationFrame(function tick() {
      const viseme = visemeAt(visemes, player.currentTime);
      if (viseme !== last) onVisemeRef.current?.((last = viseme));
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
      onVisemeRef.current?.("sil");
    };
  }, [playing, visemes, player]);

  useEffect(() => deleteFile, [deleteFile]);

  return { play, stop, playing };
}
