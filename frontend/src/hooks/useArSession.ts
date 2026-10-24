import { useSyncExternalStore } from "react";

import type { Choreography, SceneObject, Vec3 } from "@/types/simulation";

// Estado compartido entre la escena Viro (que corre dentro del navegador AR)
// y la UI de React Native que la envuelve.

export type { Vec3 };

export type ArSessionState = {
  /** Objetos 3D de la simulación activa; se montan relativos al punto del piso elegido */
  objects: SceneObject[];
  tracking: boolean;
  /** Altura (y) del plano horizontal más bajo detectado: lo tratamos como el piso */
  floorY: number | null;
  /** Punto del piso al que apunta el centro de la pantalla */
  floor: { point: Vec3; camera: Vec3 } | null;
  /** Dónde quedó anclado el personaje (y su giro para mirar a la cámara) */
  placement: { id: number; point: Vec3; yaw: number } | null;
  /** Viro solo arranca una animación cuando `run` pasa de false a true */
  animation: { name: string; run: boolean; loop: boolean };
  /** Escena coreografiada de la simulación (la batalla), si tiene */
  choreography: Choreography | null;
  /**
   * Fase de la coreografía: "waiting" hasta que todos sus modelos cargan, "playing" mientras corre la
   * animación y "finished" al terminar (caen los globos). "off" en simulaciones sin coreografía
   */
  battle: "off" | "waiting" | "playing" | "finished";
  /** Si el anfitrión camina detrás del usuario cuando se aleja (si no, solo se gira para mirarlo) */
  follow: boolean;
  /** Si el anfitrión está caminando hacia el usuario y si está hablando: deciden su animación */
  walking: boolean;
  speaking: boolean;
  modelStatus: "idle" | "loading" | "ready" | "error";
};

const initialState: ArSessionState = {
  objects: [],
  tracking: false,
  floorY: null,
  floor: null,
  placement: null,
  animation: { name: "saludo", run: false, loop: false },
  choreography: null,
  battle: "off",
  follow: false,
  walking: false,
  speaking: false,
  modelStatus: "idle",
};

let state = initialState;
const listeners = new Set<() => void>();
// Modelos ya cargados en la colocación actual: la coreografía arranca cuando están todos
const loadedModels = new Set<string>();

function set(partial: Partial<ArSessionState>) {
  // Sin cambios no se notifica: cada aviso re-renderiza la escena y la UI
  const keys = Object.keys(partial) as (keyof ArSessionState)[];
  if (keys.every((k) => state[k] === partial[k])) return;
  state = { ...state, ...partial };
  listeners.forEach((l) => l());
}

// La boca cambia muchas veces por segundo: va directo al modelo nativo, sin pasar por React
let mouth = 0;
let mouthListener: ((weight: number) => void) | null = null;

function setMouth(weight: number) {
  if (weight === mouth) return;
  mouth = weight;
  mouthListener?.(weight);
}

export const arSession = {
  get: () => state,
  set,
  // Conserva la preferencia de seguir al usuario
  reset: () => {
    setMouth(0);
    loadedModels.clear();
    set({ ...initialState, follow: state.follow });
  },
  /**
   * Otra simulación: se vuelven a colocar los objetos. No toca `tracking` ni `floorY`: reflejan la sesión nativa de ARKit/ARCore, que Viro solo reporta cuando
   * cambian; pisarlos dejaría la UI esperando un evento que no vuelve a llegar.
   */
  loadObjects(objects: SceneObject[], choreography: Choreography | null = null) {
    const battle = choreography ? "waiting" : "off";
    // Mismo anfitrión ya colocado (p. ej. Bolívar al pasar a "batalla"): se queda donde está y
    // solo se montan los objetos nuevos alrededor
    const host = (list: SceneObject[]) => list.find((o) => o.kind === "dynamic");
    const prevHost = host(state.objects);
    const nextHost = host(objects);
    if (state.placement && prevHost && nextHost?.id === prevHost.id && nextHost.model === prevHost.model) {
      const wasBattle = state.battle !== "off";
      // Entrar o salir de la batalla cambia el árbol de la escena: los modelos se vuelven a montar (y cargar)
      if (wasBattle !== !!choreography) loadedModels.clear();
      else for (const id of loadedModels) if (!objects.some((o) => o.id === id)) loadedModels.delete(id);
      set({ objects, choreography, battle, walking: false, follow: choreography ? false : state.follow });
      // Vuelve de la batalla: el anfitrión reaparece saludando
      if (wasBattle && !choreography) arSession.wave();
      else arSession.startIfReady();
      return;
    }
    loadedModels.clear();
    set({
      objects,
      choreography,
      battle,
      floor: null,
      placement: null,
      animation: initialState.animation,
      walking: false,
      modelStatus: "idle",
    });
    setMouth(0);
  },
  /** Lo avisa cada modelo al terminar de cargar */
  markLoaded(id: string) {
    loadedModels.add(id);
    arSession.startIfReady();
  },
  /** Arranca la coreografía si está esperando y ya cargaron todos sus personajes */
  startIfReady() {
    const { battle, placement, objects } = state;
    if (battle !== "waiting" || !placement) return;
    if (!objects.every((o) => o.kind !== "dynamic" || loadedModels.has(o.id))) return;
    arSession.playBattle();
  },
  playBattle() {
    const { choreography } = state;
    if (!choreography) return;
    // Todos los personajes arrancan en el mismo render: el anfitrión por `animation`, el resto por `battle`
    set({ battle: "playing", animation: { name: choreography.animation, run: true, loop: false } });
  },
  finishBattle() {
    if (state.battle === "playing") set({ battle: "finished" });
  },
  /** Repite desde el principio: Viro solo reinicia una animación si `run` pasa de false a true */
  replayBattle() {
    const { choreography } = state;
    if (!choreography) return;
    set({ battle: "waiting", animation: { name: choreography.animation, run: false, loop: false } });
    setTimeout(() => arSession.startIfReady(), 50);
  },
  /** Peso (0–1) de la shape key "boca_abierta" del anfitrión, según el visema que suena */
  setMouth,
  /** Lo registra la escena para aplicar la boca con setNativeProps; recibe el peso actual al registrarse */
  onMouth(listener: ((weight: number) => void) | null) {
    mouthListener = listener;
    listener?.(mouth);
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Ancla el personaje en el piso detectado, girado para quedar de frente al usuario */
  place(): boolean {
    const { floor } = state;
    if (!floor) return false;
    const [px, , pz] = floor.point;
    const [cx, , cz] = floor.camera;
    // El modelo mira hacia +Z; yaw 0 = de frente a una cámara ubicada en +Z
    const yaw = (Math.atan2(cx - px, cz - pz) * 180) / Math.PI;
    // Un id nuevo remonta el nodo, y Viro lo ancla en el mundo justo en ese punto
    loadedModels.clear();
    set({
      placement: { id: Date.now(), point: floor.point, yaw },
      modelStatus: "loading",
      // Recolocada, la batalla vuelve a empezar cuando carguen los modelos
      battle: state.choreography ? "waiting" : "off",
    });
    return true;
  },
  wave() {
    set({ animation: { name: "saludo", run: false, loop: false } });
    setTimeout(() => set({ animation: { name: "saludo", run: true, loop: false } }), 50);
  },
  setFollow(follow: boolean) {
    if (state.battle !== "off") return;
    set({ follow });
  },
  /**
   * Camina en loop mientras sigue al usuario: tiene prioridad sobre el saludo y sobre gesticular
   * (hablando mientras camina solo se mueve la boca). Al detenerse, si sigue hablando, gesticula
   */
  walk(walking: boolean) {
    if (walking) {
      set({ walking, animation: { name: "caminar", run: true, loop: true } });
    } else if (state.animation.name === "caminar") {
      set({
        walking,
        animation: state.speaking
          ? { name: "hablando", run: true, loop: true }
          : { name: "caminar", run: false, loop: false },
      });
    } else {
      set({ walking });
    }
  },
  /** Mientras habla gesticula en loop (si no está caminando); al callar se detiene y cierra la boca */
  talk(speaking: boolean) {
    if (!speaking) setMouth(0);
    // En la batalla los personajes no conversan: la animación no se interrumpe
    if (state.battle !== "off") return;
    if (state.walking) {
      set({ speaking });
      return;
    }
    set(
      speaking
        ? { speaking, animation: { name: "hablando", run: true, loop: true } }
        : { speaking, animation: { name: "hablando", run: false, loop: false } },
    );
  },
};

export function useArSession<T>(selector: (s: ArSessionState) => T): T {
  return useSyncExternalStore(arSession.subscribe, () => selector(state));
}
