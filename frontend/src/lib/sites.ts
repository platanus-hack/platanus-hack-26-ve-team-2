import type { LatLng } from "react-native-maps";

// Datos estáticos mientras no hay integración con la API

export type Site = {
  id: string;
  name: string;
  note: string;
  coordinate: LatLng;
};

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

export const simulations = [
  { title: "El discurso en la Plaza Bolívar", detail: "4 min · Escena activa" },
  { title: "La Batalla de Carabobo", detail: "7 min · Escena inmersiva" },
  { title: "La última campaña de Bolívar", detail: "8 min · Escena inmersiva" },
];

export function distanceInMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ~80 m por minuto caminando
export function walkingMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / 80));
}
