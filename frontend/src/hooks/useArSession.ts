import { useSyncExternalStore } from "react";

import type { SceneObject, Vec3 } from "@/types/simulation";

// Estado compartido entre la escena Viro (que corre dentro del navegador AR)
// y la UI de React Native que la envuelve.

export type { Vec3 };

export type ArSessionState = {
  /** Objetos 3D de la simulación activa; se montan relativos al punto del piso elegido */
  objects: SceneObject[];
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
  animation: { name: "saludo" | "hablando" | "caminar"; run: boolean; loop: boolean };
  /** Si el anfitrión camina detrás del usuario cuando se aleja (si no, solo se gira para mirarlo) */
  follow: boolean;
  /** Si el anfitrión está caminando hacia el usuario y si está hablando: deciden su animación */
  walking: boolean;
  speaking: boolean;
  /** Peso (0–1) de la shape key "boca_abierta" del anfitrión, según el visema que suena */
  mouth: number;
  modelStatus: "idle" | "loading" | "ready" | "error";
};

const initialState: ArSessionState = {
  objects: [],
  tracking: false,
  floorY: null,
  occlusion: "checking",
  floor: null,
  placement: null,
  animation: { name: "saludo", run: false, loop: false },
  follow: true,
  walking: false,
  speaking: false,
  mouth: 0,
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
  // Conserva el soporte de oclusión ya conocido: así la próxima sesión arranca con la configuración
  // final y ARCore no se reconfigura (pausa y reanuda) justo al iniciar
  // y la preferencia de seguir al usuario
  reset: () => set({ ...initialState, occlusion: state.occlusion, follow: state.follow }),
  /**
   * Otra simulación: se vuelven a colocar los objetos. No toca `tracking`, `floorY` ni
   * `occlusion`: reflejan la sesión nativa de ARKit/ARCore, que Viro solo reporta cuando
   * cambian; pisarlos dejaría la UI esperando un evento que no vuelve a llegar.
   */
  loadObjects(objects: SceneObject[]) {
    // Mismo anfitrión ya colocado (p. ej. Bolívar al pasar a "batalla"): se queda donde está y
    // solo se montan los objetos nuevos alrededor
    const host = (list: SceneObject[]) => list.find((o) => o.kind === "dynamic");
    const prevHost = host(state.objects);
    const nextHost = host(objects);
    if (state.placement && prevHost && nextHost?.id === prevHost.id && nextHost.model === prevHost.model) {
      set({ objects });
      return;
    }
    set({
      objects,
      floor: null,
      placement: null,
      animation: initialState.animation,
      walking: false,
      mouth: 0,
      modelStatus: "idle",
    });
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
    set({ placement: { id: Date.now(), point: floor.point, yaw }, modelStatus: "loading" });
    return true;
  },
  wave() {
    set({ animation: { name: "saludo", run: false, loop: false } });
    setTimeout(() => set({ animation: { name: "saludo", run: true, loop: false } }), 50);
  },
  setFollow(follow: boolean) {
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
    if (state.walking) {
      set(speaking ? { speaking } : { speaking, mouth: 0 });
      return;
    }
    set(
      speaking
        ? { speaking, animation: { name: "hablando", run: true, loop: true } }
        : { speaking, animation: { name: "hablando", run: false, loop: false }, mouth: 0 },
    );
  },
};

export function useArSession<T>(selector: (s: ArSessionState) => T): T {
  return useSyncExternalStore(arSession.subscribe, () => selector(state));
}
