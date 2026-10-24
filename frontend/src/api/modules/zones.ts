import type { Zone, ZoneCreate } from "@/types/zone";

import { http } from "../client";

export const ZonesModule = {
  list: () => http.get<Zone[]>("/zones"),
  create: (payload: ZoneCreate) => http.post<Zone>("/zones", payload),
  /** Zonas que contienen el punto. Si hay alguna, la app activa la experiencia AR. */
  containing: (lat: number, lng: number) => http.get<Zone[]>("/zones/contains", { query: { lat, lng } }),
};
