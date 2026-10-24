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

/** Anillo GeoJSON ([lng, lat]) → coordenadas de react-native-maps. */
export function ringToLatLngs(ring: [number, number][]): LatLng[] {
  return ring.map(([longitude, latitude]) => ({ latitude, longitude }));
}

/** Ray casting sobre el borde exterior. Suficiente para polígonos de pocas cuadras. */
export function isInsidePolygon(point: LatLng, ring: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    const crosses =
      a.latitude > point.latitude !== b.latitude > point.latitude &&
      point.longitude <
        ((b.longitude - a.longitude) * (point.latitude - a.latitude)) / (b.latitude - a.latitude) + a.longitude;
    if (crosses) inside = !inside;
  }
  return inside;
}
