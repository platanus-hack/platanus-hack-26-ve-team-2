import type { Region, SimulationStart } from "@/types/region";

import { http } from "../client";

export const RegionsModule = {
  list: () => http.get<Region[]>("/regions"),
  /** Sin simulationId arranca la simulación por defecto de la región. */
  startSimulation: (regionId: string, simulationId?: string) =>
    http.post<SimulationStart>(
      `/regions/${encodeURIComponent(regionId)}/simulations/start`,
      simulationId ? { simulation_id: simulationId } : undefined,
    ),
};
