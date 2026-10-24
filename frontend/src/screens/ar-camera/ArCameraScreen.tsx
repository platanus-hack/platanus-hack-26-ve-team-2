import { Image } from "expo-image";
import { Redirect, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  CameraShade,
  FigureSilhouette,
  MicPermissionPrompt,
  PushToTalkButton,
  SimulationsSheet,
} from "@/components/ar";
import { CircleButton, Icon, StatusRow } from "@/components/common";
import { type ActiveSimulation, useActiveSimulation } from "@/contexts/ActiveSimulationContext";
import { useMicrophonePermission } from "@/hooks/useMicrophonePermission";
import { useSimulationConversation } from "@/hooks/useSimulationConversation";
import { useStartSimulation } from "@/hooks/useStartSimulation";
import { colors, fonts } from "@/theme";
import { mouthOpenness } from "@/utils/lipsync";

export function ArCameraScreen() {
  const { active } = useActiveSimulation();
  // Se llega aquí solo desde "Comenzar simulación"; sin simulación activa no hay escena que montar
  if (!active) return <Redirect href="/" />;
  return <ArSimulationView active={active} />;
}

// Vista previa estática: la cámara AR real (Viro) montará `active.objects` más adelante
function ArSimulationView({ active }: { active: ActiveSimulation }) {
  const insets = useSafeAreaInsets();
  const { setActive } = useActiveSimulation();
  const { start } = useStartSimulation();
  // Lo primero al entrar a la simulación: pedir el micrófono
  const mic = useMicrophonePermission();
  const conversation = useSimulationConversation(active.simulationId);
  const [started, setStarted] = useState(false);
  const [scenesOpen, setScenesOpen] = useState(false);

  const { region } = active;
  const current = region.simulations.find((s) => s.id === active.simulationId);
  const { phase, lastTurn, error } = conversation;

  async function switchSimulation(simulationId: string) {
    setScenesOpen(false);
    if (simulationId === active.simulationId) return;
    const loaded = await start(region.id, simulationId);
    if (loaded) setActive({ ...loaded, region });
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Image
        source={require("@/assets/images/camera-preview.jpg")}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
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

      <View style={[styles.stage, { top: insets.top + 90, bottom: insets.bottom + 230 }]}>
        {!started ? (
          <>
            <View style={styles.direction}>
              <Icon name="arrow" size={18} color="white" />
              <Text style={styles.directionText}>Gira un poco a tu derecha</Text>
            </View>
            <View style={styles.target}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
            <View style={styles.figure}>
              <FigureSilhouette active={false} />
            </View>
          </>
        ) : (
          <View style={styles.figure}>
            <FigureSilhouette active mouthOpen={mouthOpenness(conversation.viseme)} />
            {(lastTurn || phase === "sending") && (
              <View style={styles.speech}>
                <Text style={styles.speechName}>{lastTurn?.character_name ?? "…"}</Text>
                <Text style={styles.speechText}>
                  {phase === "sending" ? "…" : `“${lastTurn?.reply_text}”`}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 28 }]}>
        {!started ? (
          <>
            <View style={styles.ready}>
              <StatusRow dark title="Simulación alineada" subtitle="Toca para comenzar la experiencia" />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Iniciar simulación"
              onPress={() => setStarted(true)}
              style={({ pressed }) => [styles.shutter, pressed && { transform: [{ scale: 0.95 }] }]}
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
                {error ?? (lastTurn?.transcript ? `Tú: “${lastTurn.transcript}”` : "Pregúntale lo que quieras")}
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
  target: { position: "absolute", width: 210, height: 290 },
  corner: { position: "absolute", width: 35, height: 35, borderColor: "#f4bc76" },
  cornerTL: { left: 0, top: 0, borderLeftWidth: 2, borderTopWidth: 2 },
  cornerTR: { right: 0, top: 0, borderRightWidth: 2, borderTopWidth: 2 },
  cornerBL: { left: 0, bottom: 0, borderLeftWidth: 2, borderBottomWidth: 2 },
  cornerBR: { right: 0, bottom: 0, borderRightWidth: 2, borderBottomWidth: 2 },
  figure: { marginTop: 80 },
  speech: {
    position: "absolute",
    right: -95,
    top: 30,
    width: 175,
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
