import type { SceneObject } from "@/types/simulation";

/**
 * Objetos 3D de cada simulación, guardados en el teléfono e indexados por el
 * `simulation_id` que devuelve POST /regions/{id}/simulations/start.
 *
 * Para agregar un modelo: ponlo en assets/models/ y regístralo aquí, p. ej.
 *   { id: "bolivar", name: "Simón Bolívar", kind: "dynamic", characterId: "bolivar",
 *     model: require("@/assets/models/bolivar.glb"), animation: "idle",
 *     transform: { position: [0, 0, -2], rotation: [0, 180, 0], scale: [1, 1, 1] } }
 */
const SIMULATION_OBJECTS: Record<string, SceneObject[]> = {
  // Pendiente: modelos de la Batalla de Carabobo
  carabobo_prueba: [],
};

export function getSimulationObjects(simulationId: string): SceneObject[] | undefined {
  return SIMULATION_OBJECTS[simulationId];
}
