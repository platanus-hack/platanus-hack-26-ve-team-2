import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from "expo-audio";
import { Camera } from "expo-camera";
import * as Location from "expo-location";
import { useEffect } from "react";
import { Platform } from "react-native";

type PermissionResult = { granted: boolean; canAskAgain: boolean };

/** Pregunta solo si aún no está concedido y el sistema permite volver a preguntar. */
async function ensure(get: () => Promise<PermissionResult>, request: () => Promise<PermissionResult>) {
  try {
    const current = await get();
    if (current.granted || !current.canAskAgain) return;
    await request();
  } catch (e) {
    console.warn("[permissions]", e);
  }
}

let pending: Promise<void> | null = null;

/**
 * Pide todos los permisos de ejecución una sola vez: ubicación, cámara (RA) y micrófono (voz).
 * Van en secuencia porque Android puede dejar sin resolver diálogos pedidos a la vez; por eso
 * los demás hooks esperan esta promesa antes de pedir los suyos.
 * Los sensores (HIGH_SAMPLING_RATE_SENSORS) son permisos de instalación: basta con declararlos en app.json.
 */
export function requestStartupPermissions(): Promise<void> {
  if (Platform.OS === "web") return Promise.resolve();
  pending ??= (async () => {
    await ensure(Location.getForegroundPermissionsAsync, Location.requestForegroundPermissionsAsync);
    await ensure(Camera.getCameraPermissionsAsync, Camera.requestCameraPermissionsAsync);
    await ensure(getRecordingPermissionsAsync, requestRecordingPermissionsAsync);
  })();
  return pending;
}

/** Lanza la ronda de permisos en cuanto la app está lista para mostrarse. */
export function useStartupPermissions(ready: boolean) {
  useEffect(() => {
    if (ready) requestStartupPermissions();
  }, [ready]);
}
