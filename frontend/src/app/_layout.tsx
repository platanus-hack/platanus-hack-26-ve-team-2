import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from "@expo-google-fonts/dm-sans";
import { Manrope_700Bold, Manrope_800ExtraBold, useFonts } from "@expo-google-fonts/manrope";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";

import { ActiveSimulationProvider } from "@/contexts/ActiveSimulationContext";
import { useStartupPermissions } from "@/hooks/useStartupPermissions";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  // Al abrir la app se piden todos los permisos (ubicación, cámara, micrófono)
  useStartupPermissions(loaded || !!error);

  if (!loaded && !error) return null;

  return (
    <ActiveSimulationProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="camera" options={{ animation: "fade" }} />
      </Stack>
    </ActiveSimulationProvider>
  );
}
