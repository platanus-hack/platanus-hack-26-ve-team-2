import { http } from "../client";

export const HealthModule = {
  check: () => http.get<{ status: string }>("/health"),
  checkDb: () => http.get<{ status: string; postgis: string }>("/health/db"),
};
