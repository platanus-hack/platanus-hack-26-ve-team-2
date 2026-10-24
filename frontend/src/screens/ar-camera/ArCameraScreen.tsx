import { ViroARSceneNavigator } from "@reactvision/react-viro";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { AppState, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CameraShade, SimulationsSheet } from "@/components/ar";
import { VistaARScene } from "@/components/ar/VistaARScene";
import { CircleButton, Icon, PrimaryButton, PrimaryLabel, StatusRow } from "@/components/common";
import { findSite, simulations, UNLOCK_RADIUS_M } from "@/data/sites";
import { arSession, useArSession } from "@/hooks/useArSession";
import { useUserLocation } from "@/hooks/useUserLocation";
import { colors, fonts } from "@/theme";
import { distanceInMeters } from "@/utils/geo";

type CameraPermission = "pending" | "granted" | "denied";

function useCameraPermission(): CameraPermission {
  const [permission, setPermission] = useState<CameraPermission>(Platform.OS === "android" ? "pending" : "granted");

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const { CAMERA } = PermissionsAndroid.PERMISSIONS;

    // Si otro permiso (ubicación) se pide a la vez, Android puede dejar esta promesa sin resolver,
    // así que primero revisamos y volvemos a revisar cuando la app regresa al frente.
    async function sync(askIfMissing: boolean) {
      if (await PermissionsAndroid.check(CAMERA)) return setPermission("granted");
      if (!askIfMissing) return;
      const result = await PermissionsAndroid.request(CAMERA);
      setPermission(result === PermissionsAndroid.RESULTS.GRANTED ? "granted" : "denied");
    }

    sync(true);
    const sub = AppState.addEventListener("change", (state) => state === "active" && sync(false));
    return () => sub.remove();
  }, []);

  return permission;
}

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

export function ArCameraScreen() {
  const insets = useSafeAreaInsets();
  const { siteId } = useLocalSearchParams<{ siteId?: string }>();
  const site = findSite(siteId);
  const camera = useCameraPermission();
  // Solo una sesión de RA a la vez: si hay otra pantalla encima, esta suelta la cámara
  const focused = useIsFocused();
  const location = useUserLocation();
  const [scenesOpen, setScenesOpen] = useState(false);
  const [scene, setScene] = useState(simulations[0].title);

  const tracking = useArSession((s) => s.tracking);
  const floorFound = useArSession((s) => s.floorY !== null);
  const hasFloor = useArSession((s) => s.floor !== null);
  const occlusion = useArSession((s) => s.occlusion);
  const depthSupported = occlusion === "supported";
  const placed = useArSession((s) => s.placement !== null);
  const modelStatus = useArSession((s) => s.modelStatus);

  useEffect(() => {
    arSession.reset();
    return () => arSession.reset();
  }, []);

  const distance = location.coords ? distanceInMeters(location.coords, site.coordinate) : null;
  // Damos margen por la imprecisión del GPS (sobre todo dentro de edificios)
  const unlocked = distance !== null && distance <= Math.max(UNLOCK_RADIUS_M, location.accuracy ?? 0);

  const status = (() => {
    if (camera === "denied") return { title: "Sin acceso a la cámara", subtitle: "Actívalo en los ajustes del teléfono" };
    if (location.status === "denied")
      return { title: "Sin acceso a tu ubicación", subtitle: "La necesitamos para saber si estás en el sitio" };
    if (distance === null) return { title: "Buscando tu ubicación…", subtitle: "Esto puede tardar unos segundos" };
    if (!unlocked)
      return { title: `Estás a ${formatDistance(distance)} de ${site.name}`, subtitle: "Acércate para activar la experiencia" };
    if (camera === "pending") return { title: "Preparando la cámara…", subtitle: "Acepta el permiso si te lo pide" };
    if (!tracking) return { title: "Escaneando el entorno…", subtitle: "Mueve el teléfono despacio" };
    if (!floorFound)
      return { title: "Escaneando el piso…", subtitle: "Apunta al piso y mueve el teléfono de lado a lado" };
    if (!hasFloor) return { title: "Apunta la cámara al piso", subtitle: "Busca una zona despejada a 1 o 2 metros" };
    return { title: "Simulación alineada", subtitle: "Toca para comenzar la experiencia" };
  })();
  // Esperamos a saber si hay oclusión: activarla con el personaje ya colocado lo oculta entero
  const canStart = unlocked && tracking && hasFloor && occlusion !== "checking";

  const placedHint = (() => {
    if (modelStatus === "error") return "No se pudo cargar el personaje";
    if (modelStatus !== "ready") return "Cargando el personaje…";
    // Al pasar el teléfono a otra persona ARCore puede perder el rastreo un momento
    if (!tracking) return "Recuperando el rastreo, mueve el teléfono despacio";
    return "Toca al personaje para que salude de nuevo";
  })();

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {focused && camera === "granted" && unlocked && (
        <ViroARSceneNavigator
          autofocus
          initialScene={{ scene: VistaARScene }}
          // Sin anchors en la nube: todo es local al teléfono
          provider="none"
          // Mesas, sillas o personas más cerca que el personaje lo tapan, como en la vida real.
          // Se activa antes de colocar al personaje: cambiarla con el modelo ya cargado lo oculta entero
          // (bug de Viro). El margen para que el piso no tape los pies lo pone scripts/patch-viro-occlusion.js
          occlusionMode={depthSupported ? "depthBased" : "disabled"}
          style={StyleSheet.absoluteFill}
        />
      )}
      <CameraShade />

      <View style={[styles.top, { paddingTop: insets.top + 12 }]}>
        <CircleButton label="Volver" variant="glass" onPress={() => router.back()}>
          <Icon name="back" color="white" />
        </CircleButton>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>RA EN VIVO</Text>
        </View>
        <CircleButton label="Sonido" variant="glass">
          <Icon name="sound" color="white" />
        </CircleButton>
      </View>

      <View style={[styles.stage, { top: insets.top + 90, bottom: insets.bottom + 190 }]} pointerEvents="none">
        {!placed ? (
          unlocked &&
          !hasFloor && (
            <View style={styles.direction}>
              <Icon name="arrow" size={18} color="white" />
              <Text style={styles.directionText}>Apunta al piso frente a ti</Text>
            </View>
          )
        ) : (
          <View style={styles.speech}>
            <Text style={styles.speechName}>Guía virtual</Text>
            <Text style={styles.speechText}>“¡Hola! Bienvenido a {site.name}.”</Text>
          </View>
        )}
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 28 }]}>
        {!placed ? (
          <>
            <View style={styles.ready}>
              <StatusRow dark title={status.title} subtitle={status.subtitle} />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Iniciar simulación"
              accessibilityState={{ disabled: !canStart }}
              disabled={!canStart}
              onPress={() => arSession.place()}
              style={({ pressed }) => [
                styles.shutter,
                !canStart && { opacity: 0.4 },
                pressed && { transform: [{ scale: 0.95 }] },
              ]}
            >
              <View style={styles.shutterInner} />
            </Pressable>
            <Text style={styles.hint}>Mantén el teléfono en alto y muévete despacio</Text>
          </>
        ) : (
          <>
            <View style={styles.sceneLabel}>
              <Text style={styles.nowPlaying}>REPRODUCIENDO</Text>
              <Text style={styles.sceneTitle}>{scene}</Text>
              <Text style={styles.remaining}>{placedHint}</Text>
            </View>
            <PrimaryButton onPress={() => setScenesOpen(true)}>
              <Icon name="layers" color="white" />
              <PrimaryLabel>Ver simulaciones disponibles</PrimaryLabel>
            </PrimaryButton>
          </>
        )}
      </View>

      <SimulationsSheet
        visible={scenesOpen}
        siteName={site.name}
        simulations={simulations}
        current={scene}
        onSelect={(title) => {
          setScene(title);
          setScenesOpen(false);
        }}
        onClose={() => setScenesOpen(false)}
      />
    </View>
  );
}

const glass = {
  backgroundColor: "rgba(19,33,27,0.6)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.18)",
} as const;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#08110e" },
  top: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 3,
  },
  livePill: {
    ...glass,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#f07242", marginRight: 6 },
  liveText: { color: "white", fontSize: 10, fontFamily: fonts.bold, letterSpacing: 1.5 },
  stage: { position: "absolute", left: 0, right: 0, alignItems: "center", justifyContent: "center" },
  direction: {
    ...glass,
    backgroundColor: "rgba(21,36,29,0.78)",
    position: "absolute",
    top: "6%",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 22,
  },
  directionText: { color: "white", fontSize: 12, fontFamily: fonts.medium },
  speech: {
    position: "absolute",
    top: "4%",
    maxWidth: 260,
    backgroundColor: "rgba(248,245,236,0.88)",
    padding: 13,
    borderRadius: 14,
    borderBottomLeftRadius: 3,
    gap: 4,
  },
  speechName: { fontFamily: fonts.displayBold, fontSize: 13, color: colors.ink },
  speechText: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 15, color: colors.ink },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 20, paddingHorizontal: 24, zIndex: 3 },
  ready: { alignItems: "center" },
  shutter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 3,
    borderColor: "white",
    padding: 6,
    alignSelf: "center",
    marginTop: 18,
    marginBottom: 12,
  },
  shutterInner: { flex: 1, borderRadius: 31, backgroundColor: colors.orange },
  hint: { color: "#c7cfca", fontSize: 11, fontFamily: fonts.regular, textAlign: "center" },
  sceneLabel: { marginBottom: 15 },
  nowPlaying: { color: "#f4b47f", fontSize: 9, letterSpacing: 1.3, fontFamily: fonts.bold },
  sceneTitle: { color: "white", fontFamily: fonts.displayBold, fontSize: 17, marginTop: 3 },
  remaining: { color: "#c6cec9", fontSize: 11, fontFamily: fonts.regular, marginTop: 3 },
});
