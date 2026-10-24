import bolivarModel from "@/assets/models/bolivar.glb";
import type { SceneObject } from "@/types/simulation";

/**
 * Objetos 3D de cada simulación, guardados en el teléfono e indexados por el
 * `simulation_id` que devuelve POST /regions/{id}/simulations/start.
 *
 * El transform es relativo al punto del piso donde el usuario coloca la escena,
 * con +Z apuntando hacia el usuario (la escena se gira para quedar de frente).
 * Los modelos van en .glb sin compresión Draco (Viro no la soporta).
 *
 * El primer objeto "dynamic" es el anfitrión: saluda al aparecer y al tocarlo.
 * Sus animaciones se llaman "saludo", "hablando" y "caminar" (por ahora solo se usa "saludo").
 */
const SIMULATION_OBJECTS: Record<string, SceneObject[]> = {
  carabobo_prueba: [
    {
      id: "guia",
      name: "Simón Bolívar",
      kind: "dynamic",
      model: bolivarModel,
      // Los pies del modelo quedan en y = 0 de su origen (mide 1,7 m); +1 cm para que la oclusión no corte las suelas
      transform: { position: [0, 0.01, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    },
  ],
};

export function getSimulationObjects(simulationId: string): SceneObject[] | undefined {
  return SIMULATION_OBJECTS[simulationId];
}
