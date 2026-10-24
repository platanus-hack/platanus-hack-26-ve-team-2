// Espejo de backend/app/schemas/region.py
import type { Polygon } from "./zone";

export interface SimulationSummary {
  id: string;
  title: string;
  description: string;
}

/** Área cerrada del mapa donde se pueden iniciar simulaciones. */
export interface Region {
  id: string;
  name: string;
  description: string;
  geometry: Polygon;
  center: { lat: number; lng: number };
  simulations: SimulationSummary[];
}

export interface SimulationStart {
  /** Clave para cargar los objetos 3D locales (ver data/simulationObjects.ts). */
  simulation_id: string;
  region_id: string;
  /** location_id para clientApi.voice.createSession */
  voice_location_id: string;
}
