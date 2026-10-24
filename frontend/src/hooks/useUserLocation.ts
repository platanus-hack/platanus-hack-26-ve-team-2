import * as Location from "expo-location";
import { useEffect, useState } from "react";
import type { LatLng } from "react-native-maps";

export type UserLocation = {
  status: "pending" | "granted" | "denied";
  coords: LatLng | null;
  /** Radio de error del GPS en metros */
  accuracy: number | null;
};

export function useUserLocation(): UserLocation {
  const [location, setLocation] = useState<UserLocation>({ status: "pending", coords: null, accuracy: null });

  useEffect(() => {
    let subscription: Location.LocationSubscription | undefined;
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== "granted") {
        setLocation({ status: "denied", coords: null, accuracy: null });
        return;
      }
      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 2 },
        ({ coords }) =>
          setLocation({
            status: "granted",
            coords: { latitude: coords.latitude, longitude: coords.longitude },
            accuracy: coords.accuracy,
          }),
      );
      if (cancelled) sub.remove();
      else subscription = sub;
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  return location;
}
