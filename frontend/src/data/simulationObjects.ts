import guideModel from "@/assets/models/model-3d-v3.glb";
import type { SceneObject } from "@/types/simulation";

/**
 * Objetos 3D de cada simulación, guardados en el teléfono e indexados por el
 * `simulation_id` que devuelve POST /regions/{id}/simulations/start.
 *
 * El transform es relativo al punto del piso donde el usuario coloca la escena,
 * con +Z apuntando hacia el usuario (la escena se gira para quedar de frente).
 * Los modelos van en .glb sin compresión Draco (Viro no la soporta).
 *
 * El primer objeto "dynamic" es el anfitrión: saluda al aparecer y al tocarlo,
 * y entre saludos reproduce `animation`. Sus animaciones se llaman "saludo" y "reposo".
 */
const SIMULATION_OBJECTS: Record<string, SceneObject[]> = {
  carabobo_prueba: [
    {
      id: "guia",
      name: "Guía virtual",
      kind: "dynamic",
      model: guideModel,
      animation: "reposo",
      // Los pies del modelo quedan en y = -1.0 de su origen; +1 cm para que la oclusión no corte las suelas
      transform: { position: [0, 1.01, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    },
  ],
};

export function getSimulationObjects(simulationId: string): SceneObject[] | undefined {
  return SIMULATION_OBJECTS[simulationId];
}
