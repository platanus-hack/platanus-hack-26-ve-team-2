/** GeoJSON: cada posición es [lng, lat]; el primer anillo es el borde exterior. */
export type Ring = [number, number][];

export interface Polygon {
  type: "Polygon";
  coordinates: Ring[];
}

export interface Zone {
  id: number;
  name: string;
  geometry: Polygon;
}

export interface ZoneCreate {
  name: string;
  geometry: Polygon;
}
