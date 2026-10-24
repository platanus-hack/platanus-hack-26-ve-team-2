/** Vector 3D en el espacio de la escena AR: metros, relativo al ancla de la simulación. */
export type Vec3 = [number, number, number];

export interface Transform {
  position: Vec3;
  /** Grados en X, Y, Z */
  rotation: Vec3;
  scale: Vec3;
}

interface BaseSceneObject {
  id: string;
  name: string;
  /** Asset del modelo empaquetado en la app: require("@/assets/models/...") */
  model: number;
  transform: Transform;
}

/** Objeto fijo de la escena (edificios, cañones, terreno). */
export interface StaticSceneObject extends BaseSceneObject {
  kind: "static";
}

/** Objeto que se anima o se mueve (personajes, tropas). */
export interface DynamicSceneObject extends BaseSceneObject {
  kind: "dynamic";
  /** Nombre de la animación del modelo a reproducir */
  animation?: string;
  /** Si conversa por voz, id del personaje en personas.yaml */
  characterId?: string;
  /** Si llega caminando: sale de `from` y avanza en línea recta hasta `transform.position` */
  entrance?: Entrance;
}

export interface Entrance {
  /** Punto de partida (solo cuentan X y Z: camina sobre el piso) */
  from: Vec3;
  durationMs: number;
  /** Animación del modelo mientras camina; sin ella el modelo se desliza */
  walkAnimation?: string;
}

export type SceneObject = StaticSceneObject | DynamicSceneObject;

/** Efecto de sonido en un momento fijo de la coreografía. */
export interface SoundCue {
  atMs: number;
  sound: string;
}

/**
 * Escena coreografiada (p. ej. la batalla): todos los personajes reproducen a la vez la animación
 * `animation`, horneada en Blender en el mismo marco y con la misma duración, mientras suenan los efectos.
 */
export interface Choreography {
  animation: string;
  durationMs: number;
  cues: SoundCue[];
  /** Assets de cada sonido que nombran los cues (y el del final) */
  sounds: Record<string, number>;
  /** Al terminar caen globos con los logos de los sponsors, con este sonido */
  finale?: { sound: string };
}

/** Simulación lista para montar: lo que devolvió la API + los objetos locales. */
export interface LoadedSimulation {
  simulationId: string;
  regionId: string;
  voiceLocationId: string;
  objects: SceneObject[];
  choreography?: Choreography;
}
