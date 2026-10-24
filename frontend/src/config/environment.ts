/**
 * Configuración de la app. Única fuente de verdad para URLs y keys.
 *
 * Expo inyecta en build time las variables `EXPO_PUBLIC_*` desde `.env` (versionado).
 * No hay distinción de entornos: desarrollo y producción usan los mismos valores.
 *
 * Nunca leas `process.env` fuera de este archivo: Expo solo reemplaza accesos
 * estáticos (`process.env.EXPO_PUBLIC_X`), no dinámicos.
 */

export interface EnvironmentConfig {
  API_BASE_URL: string;
  WS_BASE_URL: string;
  GOOGLE_MAPS_API_KEY: string;
}

const DEFAULT_API_URL = "https://api-platanus.jp6.dev";

// Quita el "/" final para poder concatenar paths que empiezan con "/"
function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

// http(s)://host → ws(s)://host (para /voice/ws)
function toWsUrl(httpUrl: string): string {
  return httpUrl.replace(/^http/, "ws");
}

function buildEnvironment(): EnvironmentConfig {
  const API_BASE_URL = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL);

  return {
    API_BASE_URL,
    WS_BASE_URL: normalizeBaseUrl(process.env.EXPO_PUBLIC_WS_URL || toWsUrl(API_BASE_URL)),
    GOOGLE_MAPS_API_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
  };
}

export const Environment: Readonly<EnvironmentConfig> = Object.freeze(buildEnvironment());

if (__DEV__) {
  console.log("[Environment]", { ...Environment, GOOGLE_MAPS_API_KEY: Environment.GOOGLE_MAPS_API_KEY ? "***" : "" });
}
