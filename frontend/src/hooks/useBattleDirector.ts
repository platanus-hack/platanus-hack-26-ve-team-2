import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { useEffect, useRef } from "react";

import { arSession, useArSession } from "@/hooks/useArSession";
import type { Choreography, VoiceCue } from "@/types/simulation";
import { mouthOpenness, visemeAt } from "@/utils/lipsync";

// Con diálogos, los efectos van más bajos para que las voces se entiendan
const EFFECTS_VOLUME_WITH_VOICES = 0.7;
// Prefijo de los reproductores de voz: no se confunden con los efectos aunque compartan nombre
const VOICE = "voz:";
const LIPSYNC_GRACE_MS = 400;

/**
 * Dirige la coreografía en curso: mientras corre la animación dispara cada efecto de sonido y cada
 * línea de diálogo en su momento y, al cumplirse la duración, la da por terminada (caen los globos con
 * su sonido). Los tiempos salen del mismo script de Blender que hornea las animaciones; si quien habla
 * es el anfitrión, se le mueve la boca con los visemas de su línea. Los efectos con posición (los
 * disparos del campo) los toca la escena como sonido espacial, desde el punto donde ocurren.
 */
export function useBattleDirector(choreography: Choreography | undefined) {
  const battle = useArSession((s) => s.battle);
  const hostCharacter = useArSession((s) => {
    const host = s.objects.find((o) => o.kind === "dynamic");
    return host?.kind === "dynamic" ? host.characterId : undefined;
  });
  const players = useRef<Record<string, AudioPlayer>>({});

  // Un reproductor por efecto y por línea, cargados de antemano para que suenen sin demora
  useEffect(() => {
    if (!choreography) return;
    const voices = choreography.voices ?? [];
    // Los que solo suenan con posición no necesitan reproductor: los toca la escena
    const flat = new Set([...choreography.cues.filter((c) => !c.at).map((c) => c.sound), choreography.finale?.sound]);
    const created: Record<string, AudioPlayer> = {};
    for (const [name, source] of Object.entries(choreography.sounds)) {
      if (!flat.has(name)) continue;
      created[name] = createAudioPlayer(source);
      if (voices.length) created[name].volume = EFFECTS_VOLUME_WITH_VOICES;
    }
    for (const voice of voices) created[VOICE + voice.id] = createAudioPlayer(voice.source);
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
    const stopLipsync: (() => void)[] = [];
    let cancelled = false;
    const timers = choreography.cues.map(({ atMs, sound, at, effect }) =>
      setTimeout(() => (at ? arSession.fire({ sound, at, effect }) : playSound(players.current, sound)), atMs),
    );
    for (const voice of choreography.voices ?? []) {
      timers.push(
        setTimeout(async () => {
          const player = players.current[VOICE + voice.id];
          if (!player) return;
          // Al repetir, el audio quedó al final de la vez anterior: se rebobina antes de sonar y de
          // leer su tiempo para la boca (si no, el lipsync creía que ya había terminado)
          await player.seekTo(0).catch(() => {});
          if (cancelled) return;
          player.play();
          if (voice.character === hostCharacter) stopLipsync.push(lipsync(player, voice));
        }, voice.atMs),
      );
    }
    timers.push(setTimeout(() => arSession.finishBattle(), choreography.durationMs));
    const current = players.current;
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      stopLipsync.forEach((stop) => stop());
      // Si se corta a la mitad (repetir, cambiar de simulación, salir) no quedan sonidos ni voces
      Object.values(current).forEach((p) => p.pause());
    };
  }, [choreography, battle, hostCharacter]);

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

/**
 * Mueve la boca del anfitrión con los visemas de la línea mientras suena: lee el tiempo del
 * reproductor en cada frame (el estado del reproductor llega cada 500 ms, muy lento para la boca).
 * Devuelve cómo detenerlo; al terminar la línea cierra la boca.
 */
function lipsync(player: AudioPlayer, voice: VoiceCue): () => void {
  let frame = 0;
  let last = -1;
  const end = voice.durationMs / 1000;
  const startedAt = Date.now();
  const tick = () => {
    const t = player.currentTime;
    // Recién arrancado el reproductor puede reportar todavía la posición anterior: no se da por terminada
    if (t >= end && Date.now() - startedAt > LIPSYNC_GRACE_MS) {
      arSession.setMouth(0);
      return;
    }
    const open = mouthOpenness(visemeAt(voice.visemes, t));
    if (open !== last) arSession.setMouth(open);
    last = open;
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(frame);
    arSession.setMouth(0);
  };
}
