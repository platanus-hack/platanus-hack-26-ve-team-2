const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export type Polygon = {
  type: "Polygon";
  coordinates: [number, number][][];
};

export type Zone = {
  id: number;
  name: string;
  geometry: Polygon;
};

export const api = {
  health: () => request<{ status: string }>("/health"),
  zonesContaining: (lat: number, lng: number) =>
    request<Zone[]>(`/zones/contains?lat=${lat}&lng=${lng}`),
};
