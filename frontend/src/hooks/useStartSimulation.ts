import { useCallback, useState } from "react";

import { ApiError, clientApi } from "@/api";
import { getSimulationChoreography, getSimulationObjects } from "@/data/simulationObjects";
import type { LoadedSimulation } from "@/types/simulation";

/**
 * "Comenzar simulación": pide a la API qué simulación arranca en la región y
 * resuelve sus objetos 3D desde el almacenamiento local de la app.
 */
export function useStartSimulation() {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const start = useCallback(async (regionId: string, simulationId?: string): Promise<LoadedSimulation | null> => {
    setStarting(true);
    setError(null);
    try {
      const res = await clientApi.regions.startSimulation(regionId, simulationId);
      const objects = getSimulationObjects(res.simulation_id);
      if (!objects) {
        throw new ApiError({
          status: 0,
          message: `La app no tiene los objetos de la simulación '${res.simulation_id}'. Actualiza la app.`,
          code: "simulation_objects_missing",
          isConnectionError: false,
        });
      }
      return {
        simulationId: res.simulation_id,
        regionId: res.region_id,
        voiceLocationId: res.voice_location_id,
        objects,
        choreography: getSimulationChoreography(res.simulation_id),
      };
    } catch (e) {
      setError(e as ApiError);
      return null;
    } finally {
      setStarting(false);
    }
  }, []);

  return { start, starting, error };
}
