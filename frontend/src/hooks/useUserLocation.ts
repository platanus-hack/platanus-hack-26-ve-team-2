import * as Location from "expo-location";
import { useEffect, useState } from "react";
import type { LatLng } from "react-native-maps";

import { requestStartupPermissions } from "./useStartupPermissions";

/** Ubicación del usuario en vivo. `null` mientras no hay permiso o primer fix de GPS. */
export function useUserLocation(): LatLng | null {
  const [location, setLocation] = useState<LatLng | null>(null);

  useEffect(() => {
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
  }, []);

  return location;
}
