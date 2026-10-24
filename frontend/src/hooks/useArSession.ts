import { useSyncExternalStore } from "react";

// Estado compartido entre la escena Viro (que corre dentro del navegador AR)
// y la UI de React Native que la envuelve.

export type Vec3 = [number, number, number];

export type ArSessionState = {
  tracking: boolean;
  /** Altura (y) del plano horizontal más bajo detectado: lo tratamos como el piso */
  floorY: number | null;
  /** Si el teléfono soporta profundidad (ARCore Depth API) */
  occlusion: "checking" | "supported" | "unsupported";
  /** Punto del piso al que apunta el centro de la pantalla */
  floor: { point: Vec3; camera: Vec3 } | null;
  /** Dónde quedó anclado el personaje (y su giro para mirar a la cámara) */
  placement: { id: number; point: Vec3; yaw: number } | null;
  /** Viro solo arranca una animación cuando `run` pasa de false a true */
  animation: { name: "saludo" | "reposo"; run: boolean };
  modelStatus: "idle" | "loading" | "ready" | "error";
};

const initialState: ArSessionState = {
  tracking: false,
  floorY: null,
  occlusion: "checking",
  floor: null,
  placement: null,
  animation: { name: "reposo", run: false },
  modelStatus: "idle",
};

let state = initialState;
const listeners = new Set<() => void>();

function set(partial: Partial<ArSessionState>) {
  state = { ...state, ...partial };
  listeners.forEach((l) => l());
}

export const arSession = {
  get: () => state,
  set,
  reset: () => set(initialState),
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
    set({ placement: { id: Date.now(), point: floor.point, yaw }, modelStatus: "loading" });
    return true;
  },
  wave() {
    set({ animation: { name: "saludo", run: false } });
    setTimeout(() => set({ animation: { name: "saludo", run: true } }), 50);
  },
  rest: () => set({ animation: { name: "reposo", run: true } }),
};

export function useArSession<T>(selector: (s: ArSessionState) => T): T {
  return useSyncExternalStore(arSession.subscribe, () => selector(state));
}
