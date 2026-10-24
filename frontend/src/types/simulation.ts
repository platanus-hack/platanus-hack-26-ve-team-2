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
}

export type SceneObject = StaticSceneObject | DynamicSceneObject;

/** Simulación lista para montar: lo que devolvió la API + los objetos locales. */
export interface LoadedSimulation {
  simulationId: string;
  regionId: string;
  voiceLocationId: string;
  objects: SceneObject[];
}
