import * as Location from "expo-location";
import { useIsFocused } from "expo-router";
import { useEffect, useState } from "react";
import type { LatLng } from "react-native-maps";

import { requestStartupPermissions } from "./useStartupPermissions";

/**
 * Ubicación del usuario en vivo. `null` mientras no hay permiso o primer fix de GPS.
 * Solo observa el GPS mientras la pantalla está visible (p. ej. no mientras la cámara RA la tapa).
 */
export function useUserLocation(): LatLng | null {
  const [location, setLocation] = useState<LatLng | null>(null);
  const focused = useIsFocused();

  useEffect(() => {
    if (!focused) return;
    let subscription: Location.LocationSubscription | undefined;
    let cancelled = false;

    (async () => {
      await requestStartupPermissions();
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted" || cancelled) return;
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 5 },
        ({ coords }) => setLocation({ latitude: coords.latitude, longitude: coords.longitude }),
      );
      if (cancelled) subscription.remove();
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [focused]);

  return location;
}
