import type { LatLng } from "react-native-maps";

/** Distancia haversine en metros. */
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
