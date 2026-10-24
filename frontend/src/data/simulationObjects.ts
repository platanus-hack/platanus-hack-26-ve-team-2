import bolivarModel from "@/assets/models/bolivar.glb";
import monteverdeModel from "@/assets/models/domingo-montereal-v3.glb";
import type { DynamicSceneObject, SceneObject } from "@/types/simulation";

/**
 * Objetos 3D de cada simulación, guardados en el teléfono e indexados por el
 * `simulation_id` que devuelve POST /regions/{id}/simulations/start.
 *
 * El transform es relativo al punto del piso donde el usuario coloca la escena,
 * con +Z apuntando hacia el usuario (la escena se gira para quedar de frente).
 * Los modelos van en .glb sin compresión Draco (Viro no la soporta).
 *
 * El primer objeto "dynamic" es el anfitrión: saluda al aparecer y al tocarlo.
 * Sus animaciones se llaman "saludo", "hablando" y "caminar" ("caminar" todavía no se usa), y para el
 * lipsync tiene la shape key "boca_abierta" (la boca la agrega scripts/add-mouth.py con Blender).
 * Si al cambiar de simulación el anfitrión es el mismo, se queda donde estaba.
 */
const bolivar: DynamicSceneObject = {
  id: "guia",
  name: "Simón Bolívar",
  kind: "dynamic",
  model: bolivarModel,
  // Los pies del modelo quedan en y = 0 de su origen (mide 1,7 m); +1 cm para que la oclusión no corte las suelas
  transform: { position: [0, 0.01, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
};

// Distancia entre ambos en la batalla
const DUEL_GAP = 1.2;

const SIMULATION_OBJECTS: Record<string, SceneObject[]> = {
  carabobo_prueba: [bolivar],
  batalla: [
    // Gira para mirar hacia donde llega Monteverde (+X); el modelo mira hacia +Z
    { ...bolivar, transform: { ...bolivar.transform, rotation: [0, 90, 0] } },
    {
      id: "monteverde",
      name: "Domingo de Monteverde",
      kind: "dynamic",
      model: monteverdeModel,
      // Modelo estático (sin esqueleto) centrado en su origen: mide 1,9 m, se escala a ~1,7 m como Bolívar
      // y se sube media altura para apoyarlo en el piso. Mira hacia -X, de frente a Bolívar.
      // TODO: con el modelo riggeado (pies en y = 0) usar y = 0.01 y walkAnimation "caminar"
      transform: { position: [DUEL_GAP, 0.866, 0], rotation: [0, -90, 0], scale: [0.9, 0.9, 0.9] },
      entrance: { from: [DUEL_GAP + 3, 0, 0], durationMs: 3500 },
    },
  ],
};

export function getSimulationObjects(simulationId: string): SceneObject[] | undefined {
  return SIMULATION_OBJECTS[simulationId];
}
