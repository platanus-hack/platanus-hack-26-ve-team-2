import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CameraShade, FigureSilhouette, SimulationsSheet } from "@/components/ar";
import { CircleButton, Icon, PrimaryButton, PrimaryLabel, StatusRow } from "@/components/common";
import { simulations, sites } from "@/data/sites";
import { colors, fonts } from "@/theme";

// Vista previa estática: la cámara AR real (Viro) se conecta más adelante
export function ArCameraScreen() {
  const insets = useSafeAreaInsets();
  const { siteId } = useLocalSearchParams<{ siteId?: string }>();
  const site = sites.find((s) => s.id === siteId) ?? sites[0];
  const [started, setStarted] = useState(false);
  const [scenesOpen, setScenesOpen] = useState(false);
  const [scene, setScene] = useState(simulations[0].title);

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

      <View style={[styles.stage, { top: insets.top + 90, bottom: insets.bottom + 190 }]}>
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
            <FigureSilhouette active />
            <View style={styles.speech}>
              <Text style={styles.speechName}>Simón Bolívar</Text>
              <Text style={styles.speechText}>“Esta plaza vio nacer una república...”</Text>
            </View>
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
              <Text style={styles.sceneTitle}>{scene}</Text>
              <Text style={styles.remaining}>Quedan 02:14</Text>
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
});
