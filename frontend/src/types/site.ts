import type { LatLng } from "react-native-maps";

export interface Site {
  id: string;
  name: string;
  note: string;
  description: string;
  coordinate: LatLng;
}

export interface Simulation {
  title: string;
  detail: string;
}
