import bolivarModel from "@/assets/models/bolivar-batalla.glb";
import monteverdeModel from "@/assets/models/monteverde-batalla.glb";
import type { Choreography, DynamicSceneObject, SceneObject } from "@/types/simulation";

import { battleChoreography } from "./battle";

/**
 * Objetos 3D de cada simulación, guardados en el teléfono e indexados por el
 * `simulation_id` que devuelve POST /regions/{id}/simulations/start.
 *
 * El transform es relativo al punto del piso donde el usuario coloca la escena,
 * con +Z apuntando hacia el usuario (la escena se gira para quedar de frente).
 * Los modelos van en .glb sin compresión Draco (Viro no la soporta).
 *
 * El primer objeto "dynamic" es el anfitrión: saluda al aparecer y al tocarlo.
 * Sus animaciones se llaman "saludo", "hablando" y "caminar" (cuando sigue al usuario), y para el
 * lipsync tiene la shape key "boca_abierta" (la boca la agrega scripts/add-mouth.py con Blender).
 * Si al cambiar de simulación el anfitrión es el mismo, se queda donde estaba.
 *
 * Los *-batalla.glb salen de scripts/battle/build_battle.py: los modelos originales más un sable y
 * la animación "batalla" (en las demás animaciones el sable va escondido). Después de generarlos hay
 * que agregarle a Bolívar la pose "reposo": python3 scripts/add-rest-pose.py assets/models/bolivar-batalla.glb
 */
const bolivar: DynamicSceneObject = {
  id: "guia",
  name: "Simón Bolívar",
  kind: "dynamic",
  model: bolivarModel,
  // Los pies del modelo quedan en y = 0 de su origen (mide 1,7 m); +1 cm para que la oclusión no corte las suelas
  transform: { position: [0, 0.01, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
};

const SIMULATION_OBJECTS: Record<string, SceneObject[]> = {
  // Conversación general: Bolívar como presentador. Es el mismo anfitrión que en las escenas, así
  // que al elegir una escena se queda donde está
  bolivar_general: [bolivar],
  carabobo_prueba: [bolivar],
  // Los dos en el mismo origen (donde está Bolívar): la animación "batalla" ya trae dónde va cada
  // uno, incluida la carrera de Monteverde desde 7 m a la derecha
  batalla: [
    bolivar,
    {
      id: "monteverde",
      name: "Domingo de Monteverde",
      kind: "dynamic",
      model: monteverdeModel,
      transform: { position: [0, 0.01, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    },
  ],
};

const SIMULATION_CHOREOGRAPHY: Record<string, Choreography> = {
  batalla: battleChoreography,
};

export function getSimulationObjects(simulationId: string): SceneObject[] | undefined {
  return SIMULATION_OBJECTS[simulationId];
}

export function getSimulationChoreography(simulationId: string): Choreography | undefined {
  return SIMULATION_CHOREOGRAPHY[simulationId];
}
