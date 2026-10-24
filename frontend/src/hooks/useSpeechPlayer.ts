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

interface Clip {
  file: File;
  visemes: Viseme[];
}

/**
 * Reproduce la respuesta del personaje y avisa a `onViseme` cada vez que cambia el visema activo,
 * sincronizado frame a frame. No pasa por el estado de React: re-renderizar la pantalla a ese ritmo
 * hacía que la RA fuera a tirones mientras el personaje habla.
 *
 * La respuesta llega frase por frase: `enqueue` las encadena en orden. `playing` sigue en true
 * entre una frase y la siguiente para que el personaje no deje de gesticular.
 */
export function useSpeechPlayer(onViseme?: (viseme: VisemeId) => void) {
  const player = useAudioPlayer(null);
  const { playing } = useAudioPlayerStatus(player);
  const [visemes, setVisemes] = useState<Viseme[]>([]);
  const [active, setActive] = useState(false);
  const onVisemeRef = useRef(onViseme);
  useEffect(() => {
    onVisemeRef.current = onViseme;
  });
  const current = useRef<Clip | null>(null);
  const queue = useRef<Clip[]>([]);

  const playNext = useCallback(() => {
    if (current.current?.file.exists) current.current.file.delete();
    const next = queue.current.shift() ?? null;
    current.current = next;
    setActive(next !== null);
    if (!next) return;
    setVisemes(next.visemes);
    player.replace({ uri: next.file.uri });
    player.play();
  }, [player]);

  const enqueue = useCallback(
    (speech: Speech) => {
      // El audio llega en base64: se escribe en caché apenas llega, para que el cambio de una frase
      // a la siguiente sea inmediato
      const ext = EXTENSION_BY_MIME[speech.audio_mime] ?? "mp3";
      const file = new File(Paths.cache, `respuesta-${Date.now()}-${queue.current.length}.${ext}`);
      file.create({ overwrite: true });
      file.write(speech.audio_b64, { encoding: "base64" });
      queue.current.push({ file, visemes: speech.visemes });
      if (!current.current) playNext();
    },
    [playNext],
  );

  const stop = useCallback(() => {
    player.pause();
    for (const clip of queue.current) if (clip.file.exists) clip.file.delete();
    queue.current = [];
    playNext(); // sin nada en cola: borra el clip actual y queda inactivo
  }, [player, playNext]);

  /** Una respuesta completa: corta lo que esté sonando. */
  const play = useCallback(
    (speech: Speech) => {
      stop();
      enqueue(speech);
    },
    [stop, enqueue],
  );

  // Al terminar una frase, la siguiente. El evento llega al terminar, no con el intervalo de estado
  useEffect(() => {
    const sub = player.addListener("playbackStatusUpdate", (status) => {
      if (status.didJustFinish) playNext();
    });
    return () => sub.remove();
  }, [player, playNext]);

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

  useEffect(() => stop, [stop]);

  return { play, enqueue, stop, playing: active || playing };
}
