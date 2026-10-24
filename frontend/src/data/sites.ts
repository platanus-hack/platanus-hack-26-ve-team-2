import type { LatLng } from "react-native-maps";

import type { Simulation, Site } from "@/types/site";
import { distanceInMeters } from "@/utils/geo";

// Datos estáticos mientras no hay integración con la API

/** Distancia máxima (m) al sitio para activar la experiencia RA. El GPS en interiores falla 20-50 m. */
export const UNLOCK_RADIUS_M = 100;

// Ubicación de respaldo si no hay permiso de GPS
export const fallbackLocation: LatLng = { latitude: 10.5049, longitude: -66.9134 };

const caracasStory =
  "Viaja a 1810 y presencia el momento en que cambió la historia. Una experiencia inmersiva en el corazón de Caracas.";

export const sites: Site[] = [
  {
    id: "plaza-bolivar",
    name: "Plaza Bolívar",
    note: "3 simulaciones",
    description: caracasStory,
    coordinate: { latitude: 10.50615, longitude: -66.91459 },
  },
  {
    id: "casa-amarilla",
    name: "Casa Amarilla",
    note: "2 simulaciones",
    description: caracasStory,
    coordinate: { latitude: 10.50662, longitude: -66.91545 },
  },
  {
    id: "capitolio",
    name: "Capitolio Nacional",
    note: "1 simulación",
    description: caracasStory,
    coordinate: { latitude: 10.50532, longitude: -66.91649 },
  },
  {
    id: "punto-prueba",
    name: "Punto de prueba",
    note: "1 simulación",
    description: "Punto para probar la experiencia de realidad aumentada con el modelo 3D.",
    coordinate: { latitude: 10.4837243, longitude: -66.8534205 },
  },
];

export const simulations: Simulation[] = [
  { title: "El discurso en la Plaza Bolívar", detail: "4 min · Escena activa" },
  { title: "La Batalla de Carabobo", detail: "7 min · Escena inmersiva" },
  { title: "La última campaña de Bolívar", detail: "8 min · Escena inmersiva" },
];

export function findSite(id: string | undefined): Site {
  return sites.find((s) => s.id === id) ?? sites[0];
}

export function nearestSiteIndex(from: LatLng): number {
  let best = 0;
  sites.forEach((s, i) => {
    if (distanceInMeters(from, s.coordinate) < distanceInMeters(from, sites[best].coordinate)) best = i;
  });
  return best;
}
