import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import type { Region } from "@/types/region";
import type { LoadedSimulation } from "@/types/simulation";

export interface ActiveSimulation extends LoadedSimulation {
  region: Region;
}

interface ActiveSimulationValue {
  active: ActiveSimulation | null;
  setActive: (simulation: ActiveSimulation | null) => void;
}

const ActiveSimulationContext = createContext<ActiveSimulationValue | null>(null);

/** Simulación en curso, compartida entre el mapa (que la inicia) y la cámara AR (que la monta). */
export function ActiveSimulationProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveSimulation | null>(null);
  const value = useMemo(() => ({ active, setActive }), [active]);
  return <ActiveSimulationContext.Provider value={value}>{children}</ActiveSimulationContext.Provider>;
}

export function useActiveSimulation(): ActiveSimulationValue {
  const ctx = useContext(ActiveSimulationContext);
  if (!ctx) throw new Error("useActiveSimulation debe usarse dentro de ActiveSimulationProvider");
  return ctx;
}
