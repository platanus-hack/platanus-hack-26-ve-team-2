import { useSyncExternalStore } from "react";

import type { Choreography, SceneObject, Vec3 } from "@/types/simulation";

// Estado compartido entre la escena Viro (que corre dentro del navegador AR)
// y la UI de React Native que la envuelve.

export type { Vec3 };

// Corrección automática del tamaño: en algunos lugares (vidrios, alfombra lisa) ARCore exagera las
// distancias y mide el piso a 1,7–1,9 m bajo el teléfono, cuando en la mano suele estar a ~1,35 m. Como
// el personaje mide 1,7 m en esas unidades exageradas, se veía chico: lo agrandamos en la misma
// proporción. Solo agranda (sentado el piso está cerca de verdad) y hasta un tope
const EXPECTED_PHONE_HEIGHT = 1.35;
const MAX_AUTO_SCALE = 1.3;
// Ajuste manual del tamaño (modo "mover"): pasos y rango
export const SIZE_STEP = 0.05;
export const MIN_SIZE_SCALE = 0.7;
export const MAX_SIZE_SCALE = 1.3;

export type ArSessionState = {
  /** Objetos 3D de la simulación activa; se montan relativos al punto del piso elegido */
  objects: SceneObject[];
  /**
   * Personajes de las otras simulaciones de la región: se cargan ocultos de antemano para que al
   * cambiar de simulación aparezcan al instante (cargar un GLB de varios MB tarda segundos)
   */
  preload: SceneObject[];
  tracking: boolean;
  /** Altura (y) del plano horizontal más bajo detectado: lo tratamos como el piso */
  floorY: number | null;
  /** Punto del piso al que apunta el centro de la pantalla */
  floor: { point: Vec3; camera: Vec3 } | null;
  /** Dónde quedó anclado el personaje (y su giro para mirar a la cámara) */
  placement: { id: number; point: Vec3; yaw: number; autoScale: number } | null;
  /** Ajuste manual del tamaño de los personajes (se multiplica por la corrección automática) */
  sizeScale: number;
  /**
   * Viro solo arranca una animación cuando `run` pasa de false a true, o al cambiar de nombre con `run` en true.
   * El anfitrión usa "saludo", "hablando", "caminar", "reposo" (pose quieta de pie, scripts/add-rest-pose.py)
   * y la de la coreografía
   */
  animation: { name: string; run: boolean; loop: boolean };
  /** Escena coreografiada de la simulación (la batalla), si tiene */
  choreography: Choreography | null;
  /**
   * Fase de la coreografía: "waiting" hasta que todos sus modelos cargan, "playing" mientras corre la
   * animación y "finished" al terminar (caen los globos). "off" en simulaciones sin coreografía
   */
  battle: "off" | "waiting" | "playing" | "finished";
  /**
   * Coreografía de campo abierto (layout "field"): dónde quedó el marco del campo, en el marco de la
   * colocación. Se fija frente al usuario al empezar; null hasta entonces
   */
  field: { x: number; z: number; yaw: number } | null;
  /** Disparos (y otros sonidos con posición) que están sonando en el campo: la escena los dibuja */
  firing: FieldShot[];
  /** Si el anfitrión camina detrás del usuario cuando se aleja (si no, solo se gira para mirarlo) */
  follow: boolean;
  /** Si el anfitrión se gira solo para mirar al usuario; al orientarlo a mano se queda mirando hacia donde lo dejaron */
  faceUser: boolean;
  /** Modo "mover": el usuario reubica y orienta al anfitrión; mientras tanto no camina ni se gira solo */
  editing: boolean;
  /** Aviso breve del modo "mover" (p. ej. no se encontró el piso donde tocó) */
  moveNotice: string | null;
  /** Si el anfitrión está caminando hacia el usuario y si está hablando: deciden su animación */
  walking: boolean;
  speaking: boolean;
  modelStatus: "idle" | "loading" | "ready" | "error";
};

/** Un cue con posición de la coreografía de campo, mientras suena */
export type FieldShot = { id: number; sound: string; at: Vec3; effect?: "humo" };

// Lo que dura montado un disparo: el sonido y el humo terminan antes
const SHOT_MS = 3000;

const initialState: ArSessionState = {
  objects: [],
  preload: [],
  tracking: false,
  floorY: null,
  floor: null,
  placement: null,
  sizeScale: 1,
  animation: { name: "saludo", run: false, loop: false },
  choreography: null,
  battle: "off",
  field: null,
  firing: [],
  follow: false,
  faceUser: true,
  editing: false,
  moveNotice: null,
  walking: false,
  speaking: false,
  modelStatus: "idle",
};

let state = initialState;
let shotId = 0;

const isField = (choreography: Choreography | null) => choreography?.layout === "field";

/**
 * Si la coreografía maneja al anfitrión (la batalla en escenario). En el campo no: el anfitrión se
 * queda con el usuario, conversa y lo puede seguir mientras la escena corre alrededor
 */
function hostInChoreography(): boolean {
  return state.battle !== "off" && !isField(state.choreography);
}
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
/** Órdenes del modo "mover" para el anfitrión; las aplica la escena, que conoce la cámara y su pose */
export type HostCommand =
  /** Desplazamiento del dedo (px) en la pantalla: a la derecha y hacia arriba (= alejarlo) */
  | { type: "move"; right: number; up: number }
  /** Toque en la pantalla (px, coordenadas de la ventana): lo lleva al piso en ese punto */
  | { type: "place"; x: number; y: number }
  /** Giro en grados (positivo = antihorario visto desde arriba) */
  | { type: "rotate"; degrees: number }
  /** Orientación respecto del usuario */
  | { type: "face"; side: "front" | "side" | "back" };

let hostControl: ((command: HostCommand) => void) | null = null;

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
    set({ ...initialState, follow: state.follow, sizeScale: state.sizeScale });
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
      const wasBattle = hostInChoreography();
      // Los personajes que salen de la escena pasan a precargados (ocultos pero cargados) en el mismo
      // cambio: si quedaran un render fuera, Viro los desmontaría y habría que volver a cargarlos. Los
      // soldados del campo no: son muchos y pesados, se descargan
      const active = new Set(objects.map((o) => o.id));
      const leaving = isField(state.choreography) ? [] : state.objects.filter((o) => o.kind === "dynamic");
      const preload = [...state.preload, ...leaving].filter(
        (o, i, all) => !active.has(o.id) && all.findIndex((x) => x.id === o.id) === i,
      );
      const mounted = new Set([...objects, ...preload].map((o) => o.id));
      for (const id of loadedModels) if (!mounted.has(id)) loadedModels.delete(id);
      // En la batalla no hay modo "mover": la coreografía decide dónde está cada uno. En el campo sí:
      // el anfitrión sigue con el usuario
      const hostFree = !choreography || isField(choreography);
      set({
        objects,
        preload,
        choreography,
        battle,
        field: null,
        firing: [],
        walking: false,
        follow: hostFree ? state.follow : false,
        editing: hostFree ? state.editing : false,
      });
      // Vuelve de la batalla: el anfitrión reaparece saludando
      if (wasBattle && !hostInChoreography()) arSession.wave();
      else arSession.startIfReady();
      return;
    }
    loadedModels.clear();
    set({
      objects,
      preload: [],
      choreography,
      battle,
      field: null,
      firing: [],
      floor: null,
      placement: null,
      faceUser: true,
      editing: false,
      animation: initialState.animation,
      walking: false,
      modelStatus: "idle",
    });
    setMouth(0);
  },
  /** Personajes a cargar ocultos (los de las otras simulaciones que no están en la actual) */
  setPreload(objects: SceneObject[]) {
    const active = new Set(state.objects.map((o) => o.id));
    // Los que ya están precargados conservan su lugar (y su carga)
    const preload = [
      ...state.preload.filter((o) => !active.has(o.id)),
      ...objects.filter((o) => o.kind === "dynamic" && !active.has(o.id) && !state.preload.some((p) => p.id === o.id)),
    ];
    const same = preload.length === state.preload.length && preload.every((o, i) => o === state.preload[i]);
    if (!same) set({ preload });
  },
  /** Lo avisa cada modelo al terminar de cargar */
  markLoaded(id: string) {
    loadedModels.add(id);
    arSession.startIfReady();
  },
  /** Arranca la coreografía si está esperando y ya cargaron todos sus personajes */
  startIfReady() {
    const { battle, placement, objects, choreography, field } = state;
    if (battle !== "waiting" || !placement) return;
    // El campo se arma cuando la escena sabe dónde está el usuario
    if (isField(choreography) && !field) return;
    if (!objects.every((o) => o.kind !== "dynamic" || loadedModels.has(o.id))) return;
    arSession.playBattle();
  },
  playBattle() {
    const { choreography } = state;
    if (!choreography) return;
    // En el campo el anfitrión no actúa en la escena: los soldados arrancan por `battle`
    if (isField(choreography)) {
      set({ battle: "playing", firing: [] });
      return;
    }
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
    // En el campo se repite en el mismo lugar (`field` se conserva); el anfitrión sigue en lo suyo
    if (isField(choreography)) set({ battle: "waiting", firing: [] });
    else set({ battle: "waiting", animation: { name: choreography.animation, run: false, loop: false } });
    setTimeout(() => arSession.startIfReady(), 50);
  },
  /** Marco del campo frente al usuario: lo calcula la escena con la pose de la cámara */
  setField(field: NonNullable<ArSessionState["field"]>) {
    if (!isField(state.choreography) || state.field) return;
    set({ field });
    arSession.startIfReady();
  },
  /** Un disparo (o un grito, una caída) que suena en un punto del campo, con su humo */
  fire(cue: Omit<FieldShot, "id">) {
    const shot = { ...cue, id: ++shotId };
    set({ firing: [...state.firing, shot] });
    setTimeout(() => {
      if (state.firing.includes(shot)) set({ firing: state.firing.filter((s) => s !== shot) });
    }, SHOT_MS);
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
    const drop = floor.camera[1] - floor.point[1];
    const autoScale = Math.min(MAX_AUTO_SCALE, Math.max(1, drop / EXPECTED_PHONE_HEIGHT));
    if (__DEV__) console.log("[AR] colocado", JSON.stringify({ point: floor.point, drop: drop.toFixed(2), autoScale: autoScale.toFixed(2) }));
    loadedModels.clear();
    set({
      placement: { id: Date.now(), point: floor.point, yaw, autoScale },
      modelStatus: "loading",
      faceUser: true,
      editing: false,
      // Recolocada, la batalla vuelve a empezar cuando carguen los modelos (el campo, frente al usuario)
      battle: state.choreography ? "waiting" : "off",
      field: null,
      firing: [],
    });
    return true;
  },
  wave() {
    set({ animation: { name: "saludo", run: false, loop: false } });
    setTimeout(() => set({ animation: { name: "saludo", run: true, loop: false } }), 50);
  },
  /** Seguir al usuario implica volver a mirarlo */
  setFollow(follow: boolean) {
    // En la batalla la coreografía decide dónde está cada uno
    if (hostInChoreography()) return;
    set(follow ? { follow, faceUser: true } : { follow });
  },
  /** Vuelve a girarse solo para mirar al usuario (tras haberlo orientado a mano) */
  lookAtUser() {
    set({ faceUser: true });
  },
  /** Entra al modo "mover": deja de seguir al usuario para que no se vaya del lugar elegido */
  startEditing() {
    set({ editing: true, follow: false });
  },
  /** Agranda (+1) o achica (-1) a los personajes un paso */
  resize(direction: 1 | -1) {
    const next = Math.round((state.sizeScale + direction * SIZE_STEP) * 100) / 100;
    set({ sizeScale: Math.min(MAX_SIZE_SCALE, Math.max(MIN_SIZE_SCALE, next)) });
  },
  stopEditing() {
    set({ editing: false, moveNotice: null });
  },
  /** Orden del modo "mover"; girarlo a mano hace que se quede mirando hacia donde lo dejen */
  controlHost(command: HostCommand) {
    if (!state.editing) return;
    if (command.type === "rotate" || command.type === "face") set({ faceUser: false });
    hostControl?.(command);
  },
  /** Lo registra la escena para aplicar las órdenes del modo "mover" */
  onHostControl(listener: ((command: HostCommand) => void) | null) {
    hostControl = listener;
  },
  /**
   * Camina en loop mientras sigue al usuario: tiene prioridad sobre el saludo y sobre gesticular
   * (hablando mientras camina solo se mueve la boca). Al detenerse, si sigue hablando, gesticula; si no,
   * vuelve a la pose de reposo (detener "caminar" lo dejaba congelado a mitad del paso)
   */
  walk(walking: boolean) {
    if (walking) {
      set({ walking, animation: { name: "caminar", run: true, loop: true } });
    } else if (state.animation.name === "caminar") {
      set({
        walking,
        animation: state.speaking
          ? { name: "hablando", run: true, loop: true }
          : { name: "reposo", run: true, loop: false },
      });
    } else {
      set({ walking });
    }
  },
  /** Mientras habla gesticula en loop (si no está caminando); al callar se detiene y cierra la boca */
  talk(speaking: boolean) {
    if (!speaking) setMouth(0);
    // En la batalla los personajes no conversan: la animación no se interrumpe
    if (hostInChoreography()) return;
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
