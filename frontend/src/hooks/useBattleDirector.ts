import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { useEffect, useRef } from "react";

import { arSession, useArSession } from "@/hooks/useArSession";
import type { Choreography } from "@/types/simulation";

/**
 * Dirige la coreografía en curso: mientras corre la animación dispara cada efecto de sonido en su
 * momento y, al cumplirse la duración, la da por terminada (caen los globos con su sonido).
 * Los tiempos salen del mismo script de Blender que hornea las animaciones. Los efectos con posición
 * (los disparos del campo) los toca la escena como sonido espacial, desde el punto donde ocurren.
 */
export function useBattleDirector(choreography: Choreography | undefined) {
  const battle = useArSession((s) => s.battle);
  const players = useRef<Record<string, AudioPlayer>>({});

  // Un reproductor por efecto, cargados de antemano para que suenen sin demora
  useEffect(() => {
    if (!choreography) return;
    // Los que solo suenan con posición no necesitan reproductor: los toca la escena
    const flat = new Set([...choreography.cues.filter((c) => !c.at).map((c) => c.sound), choreography.finale?.sound]);
    const created = Object.fromEntries(
      Object.entries(choreography.sounds)
        .filter(([name]) => flat.has(name))
        .map(([name, source]) => [name, createAudioPlayer(source)]),
    );
    players.current = created;
    return () => {
      Object.values(created).forEach((p) => p.release());
      players.current = {};
    };
  }, [choreography]);

  useEffect(() => {
    if (!choreography || battle !== "playing") return;
    // Que suene aunque el iPhone esté en silencio, y por el altavoz (no por el auricular de llamadas)
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
    const timers = choreography.cues.map(({ atMs, sound, at, effect }) =>
      setTimeout(() => (at ? arSession.fire({ sound, at, effect }) : playSound(players.current, sound)), atMs),
    );
    timers.push(setTimeout(() => arSession.finishBattle(), choreography.durationMs));
    const current = players.current;
    return () => {
      timers.forEach(clearTimeout);
      // Si se corta a la mitad (repetir, cambiar de simulación, salir) no quedan efectos sonando
      Object.values(current).forEach((p) => p.pause());
    };
  }, [choreography, battle]);

  // Va aparte: la limpieza del efecto anterior (que pausa todo) corre antes que este
  useEffect(() => {
    if (battle === "finished" && choreography?.finale) playSound(players.current, choreography.finale.sound);
  }, [choreography, battle]);
}

function playSound(players: Record<string, AudioPlayer>, name: string) {
  const player = players[name];
  if (!player) return;
  // El mismo efecto puede repetirse (varios choques de sable): vuelve a empezar
  player.seekTo(0).catch(() => {});
  player.play();
}
