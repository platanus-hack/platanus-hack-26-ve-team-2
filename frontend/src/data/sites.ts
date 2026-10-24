import type { LatLng } from "react-native-maps";

import type { Simulation, Site } from "@/types/site";

// Datos estáticos mientras no hay integración con la API

export const userLocation: LatLng = { latitude: 10.5049, longitude: -66.9134 };

export const sites: Site[] = [
  {
    id: "plaza-bolivar",
    name: "Plaza Bolívar",
    note: "3 simulaciones",
    coordinate: { latitude: 10.50615, longitude: -66.91459 },
  },
  {
    id: "casa-amarilla",
    name: "Casa Amarilla",
    note: "2 simulaciones",
    coordinate: { latitude: 10.50662, longitude: -66.91545 },
  },
  {
    id: "capitolio",
    name: "Capitolio Nacional",
    note: "1 simulación",
    coordinate: { latitude: 10.50532, longitude: -66.91649 },
  },
];

export const simulations: Simulation[] = [
  { title: "El discurso en la Plaza Bolívar", detail: "4 min · Escena activa" },
  { title: "La Batalla de Carabobo", detail: "7 min · Escena inmersiva" },
  { title: "La última campaña de Bolívar", detail: "8 min · Escena inmersiva" },
];
