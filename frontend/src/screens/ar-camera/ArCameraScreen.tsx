import { ViroARSceneNavigator } from "@reactvision/react-viro";
import { Redirect, router, useIsFocused } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { AppState, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CameraShade, MicPermissionPrompt, PushToTalkButton, SimulationsSheet } from "@/components/ar";
import { VistaARScene } from "@/components/ar/VistaARScene";
import { CircleButton, Icon, StatusRow } from "@/components/common";
import { type ActiveSimulation, useActiveSimulation } from "@/contexts/ActiveSimulationContext";
import { arSession, useArSession } from "@/hooks/useArSession";
import { useMicrophonePermission } from "@/hooks/useMicrophonePermission";
import { useSimulationConversation } from "@/hooks/useSimulationConversation";
import { useStartSimulation } from "@/hooks/useStartSimulation";
import { colors, fonts } from "@/theme";
import { mouthOpenness } from "@/utils/lipsync";

type CameraPermission = "pending" | "granted" | "denied";


function useCameraPermission(): CameraPermission {
  const [permission, setPermission] = useState<CameraPermission>(Platform.OS === "android" ? "pending" : "granted");

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const { CAMERA } = PermissionsAndroid.PERMISSIONS;

    // Si otro permiso (micrófono, ubicación) se pide a la vez, Android puede dejar esta promesa sin
    // resolver, así que primero revisamos y volvemos a revisar cuando la app regresa al frente.
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

export function ArCameraScreen() {
  const { active } = useActiveSimulation();
  // Se llega aquí solo desde "Comenzar simulación"; sin simulación activa no hay escena que montar
  if (!active) return <Redirect href="/" />;
  return <ArSimulationView active={active} />;
}

function ArSimulationView({ active }: { active: ActiveSimulation }) {
  const insets = useSafeAreaInsets();
  const { setActive } = useActiveSimulation();
  const { start } = useStartSimulation();
  const camera = useCameraPermission();
  // Solo una sesión de RA a la vez: si hay otra pantalla encima, esta suelta la cámara
  const focused = useIsFocused();
  // Lo primero al entrar a la simulación: pedir el micrófono
  const mic = useMicrophonePermission();
  const conversation = useSimulationConversation(active.simulationId);
  const [scenesOpen, setScenesOpen] = useState(false);

  const tracking = useArSession((s) => s.tracking);
  const floorFound = useArSession((s) => s.floorY !== null);
  const hasFloor = useArSession((s) => s.floor !== null);
  const placed = useArSession((s) => s.placement !== null);
  const modelStatus = useArSession((s) => s.modelStatus);
  const occlusion = useArSession((s) => s.occlusion);
  const depthSupported = occlusion === "supported";

  const { region } = active;
  const current = region.simulations.find((s) => s.id === active.simulationId);
  const { phase, lastTurn, error, viseme } = conversation;
  const hasObjects = active.objects.length > 0;

  // Al salir de la pantalla la sesión AR se destruye: todo vuelve al estado inicial
  useEffect(() => () => arSession.reset(), []);

  // Otra simulación = otros objetos: se vuelven a colocar en el piso
  useEffect(() => {
    arSession.loadObjects(active.objects);
  }, [active.objects]);

  // Lipsync: el visema que suena mueve la boca del anfitrión y, mientras habla, gesticula
  const speaking = phase === "speaking";
  const wasSpeaking = useRef(false);
  useEffect(() => {
    // Solo en los cambios reales: un talk(false) al colocarlo pisaría el saludo inicial
    if (speaking === wasSpeaking.current) return;
    wasSpeaking.current = speaking;
    arSession.talk(speaking);
  }, [speaking]);
  useEffect(() => {
    if (speaking) arSession.set({ mouth: mouthOpenness(viseme) });
  }, [speaking, viseme]);

  async function switchSimulation(simulationId: string) {
    setScenesOpen(false);
    if (simulationId === active.simulationId) return;
    const loaded = await start(region.id, simulationId);
    if (loaded) setActive({ ...loaded, region });
  }

  const status = (() => {
    if (camera === "denied") return { title: "Sin acceso a la cámara", subtitle: "Actívalo en los ajustes del teléfono" };
    if (!hasObjects) return { title: "Simulación sin modelos 3D", subtitle: "Esta simulación todavía no tiene personajes" };
    if (camera === "pending") return { title: "Preparando la cámara…", subtitle: "Acepta el permiso si te lo pide" };
    if (mic.status === "checking") return { title: "Preparando el micrófono…", subtitle: "Acepta el permiso si te lo pide" };
    if (!tracking) return { title: "Escaneando el entorno…", subtitle: "Mueve el teléfono despacio" };
    if (hasFloor) return { title: "Simulación alineada", subtitle: "Toca para comenzar la experiencia" };
    if (!floorFound)
      return { title: "Escaneando el piso…", subtitle: "Apunta al piso y mueve el teléfono de lado a lado" };
    return { title: "Apunta la cámara al piso", subtitle: "Busca una zona despejada a 1 o 2 metros" };
  })();
  // Esperamos a saber si hay oclusión: activarla con el personaje ya colocado lo oculta entero
  const canStart = hasObjects && tracking && hasFloor && occlusion !== "checking";

  const placedHint = (() => {
    if (modelStatus === "error") return "No se pudo cargar el personaje";
    if (modelStatus !== "ready") return "Cargando el personaje…";
    // Al pasar el teléfono a otra persona ARCore puede perder el rastreo un momento
    if (!tracking) return "Recuperando el rastreo, mueve el teléfono despacio";
    return null;
  })();

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {/* ARKit/ARCore arranca recién cuando el permiso del micrófono está resuelto: el diálogo del
          sistema pone la app en "inactive" y, si aparece mientras la sesión AR inicializa, el
          rastreo puede no volver a reportarse (se queda en "Escaneando el entorno…") */}
      {focused && camera === "granted" && hasObjects && mic.status !== "checking" && (
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

      <View style={[styles.stage, { top: insets.top + 90, bottom: insets.bottom + 230 }]} pointerEvents="none">
        {!placed ? (
          tracking &&
          !hasFloor && (
            <View style={styles.direction}>
              <Icon name="arrow" size={18} color="white" />
              <Text style={styles.directionText}>Apunta al piso frente a ti</Text>
            </View>
          )
        ) : (
          (lastTurn || phase === "sending") && (
            <View style={styles.speech}>
              <Text style={styles.speechName}>{lastTurn?.character_name ?? "…"}</Text>
              <Text style={styles.speechText}>{phase === "sending" ? "…" : `“${lastTurn?.reply_text}”`}</Text>
            </View>
          )
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
              <Text style={styles.sceneTitle}>{current?.title ?? region.name}</Text>
              <Text style={[styles.remaining, error && styles.error]} numberOfLines={2}>
                {placedHint ??
                  error ??
                  (lastTurn?.transcript ? `Tú: “${lastTurn.transcript}”` : "Pregúntale lo que quieras")}
              </Text>
            </View>

            {mic.status === "granted" ? (
              <View style={styles.talkRow}>
                <View style={styles.side} />
                <PushToTalkButton
                  phase={phase}
                  onPressIn={conversation.startTalking}
                  onPressOut={conversation.stopTalking}
                />
                <View style={styles.side}>
                  <CircleButton label="Ver simulaciones disponibles" variant="glass" onPress={() => setScenesOpen(true)}>
                    <Icon name="layers" color="white" />
                  </CircleButton>
                </View>
              </View>
            ) : (
              <MicPermissionPrompt status={mic.status} onRequest={mic.request} />
            )}
          </>
        )}
      </View>

      <SimulationsSheet
        visible={scenesOpen}
        siteName={region.name}
        simulations={region.simulations}
        currentId={active.simulationId}
        onSelect={switchSimulation}
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
  error: { color: "#f4b47f" },
  talkRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  side: { width: 44, marginTop: 20 },
});
