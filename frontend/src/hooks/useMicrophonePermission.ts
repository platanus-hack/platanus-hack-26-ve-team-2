import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from "expo-audio";
import { useCallback, useEffect, useState } from "react";
import { AppState, Linking } from "react-native";

/**
 * - checking: consultando el estado inicial
 * - granted: se puede grabar
 * - denied: rechazado, pero el sistema permite volver a preguntar
 * - blocked: rechazado de forma permanente; solo se habilita desde Ajustes
 */
export type MicPermission = "checking" | "granted" | "denied" | "blocked";

function toState({ granted, canAskAgain }: { granted: boolean; canAskAgain: boolean }): MicPermission {
  if (granted) return "granted";
  return canAskAgain ? "denied" : "blocked";
}

/** Pide el micrófono al montar y re-verifica al volver de Ajustes. */
export function useMicrophonePermission() {
  const [status, setStatus] = useState<MicPermission>("checking");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const current = await getRecordingPermissionsAsync();
      const result = current.granted || !current.canAskAgain ? current : await requestRecordingPermissionsAsync();
      if (!cancelled) setStatus(toState(result));
    })();

    // El usuario pudo habilitarlo en Ajustes mientras la app estaba en segundo plano
    const subscription = AppState.addEventListener("change", async (state) => {
      if (state !== "active") return;
      const current = await getRecordingPermissionsAsync();
      if (!cancelled) setStatus(toState(current));
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  /** Vuelve a pedir el permiso, o abre Ajustes si el sistema ya no deja preguntar. */
  const request = useCallback(async () => {
    if (status === "blocked") {
      await Linking.openSettings();
      return;
    }
    setStatus(toState(await requestRecordingPermissionsAsync()));
  }, [status]);

  return { status, request };
}
