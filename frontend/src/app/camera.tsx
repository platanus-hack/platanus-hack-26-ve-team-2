import { Image } from "expo-image";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { FigureSilhouette } from "@/components/figure-silhouette";
import { Icon } from "@/components/icon";
import { CircleButton, PrimaryButton, PrimaryLabel, StatusRow } from "@/components/ui";
import { simulations } from "@/lib/sites";
import { colors, fonts } from "@/lib/theme";

// Vista previa estática: la cámara AR real (Viro) se conecta más adelante
export default function CameraScreen() {
  const insets = useSafeAreaInsets();
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
      <Shade />

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

      <Modal visible={scenesOpen} transparent animationType="fade" onRequestClose={() => setScenesOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setScenesOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 25 }]} onPress={() => {}}>
            <View style={styles.handle} />
            <View style={styles.sheetHead}>
              <View>
                <Text style={styles.sheetEyebrow}>PLAZA BOLÍVAR</Text>
                <Text style={styles.sheetTitle}>Elige una simulación</Text>
              </View>
              <CircleButton label="Cerrar" variant="muted" onPress={() => setScenesOpen(false)}>
                <Icon name="x" />
              </CircleButton>
            </View>
            {simulations.map((item, i) => {
              const current = scene === item.title;
              return (
                <Pressable
                  key={item.title}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.sceneRow, pressed && { opacity: 0.7 }]}
                  onPress={() => {
                    setScene(item.title);
                    setScenesOpen(false);
                  }}
                >
                  <Text style={styles.sceneNum}>0{i + 1}</Text>
                  <View style={styles.sceneInfo}>
                    <Text style={[styles.sceneRowTitle, current && { color: "#c76035" }]}>{item.title}</Text>
                    <Text style={styles.sceneRowDetail}>{item.detail}</Text>
                  </View>
                  <Icon name="chevron" />
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Shade() {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#12231d" stopOpacity={0.6} />
          <Stop offset="0.3" stopColor="#12231d" stopOpacity={0} />
          <Stop offset="0.52" stopColor="#08110e" stopOpacity={0} />
          <Stop offset="1" stopColor="#08110e" stopOpacity={0.9} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#shade)" />
    </Svg>
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
  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(9,17,13,0.71)" },
  sheet: {
    backgroundColor: colors.cream,
    paddingTop: 10,
    paddingHorizontal: 20,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 5,
    backgroundColor: "#d4d2cc",
    alignSelf: "center",
    marginBottom: 16,
  },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  sheetEyebrow: { color: "#a35f3d", fontSize: 9, letterSpacing: 1.4, fontFamily: fonts.bold },
  sheetTitle: { fontFamily: fonts.display, fontSize: 22, marginTop: 4, color: colors.ink },
  sceneRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#deddd7",
    paddingVertical: 14,
    paddingHorizontal: 2,
  },
  sceneNum: { width: 40, fontFamily: fonts.displayBold, fontSize: 12, color: "#999e9a" },
  sceneInfo: { flex: 1, gap: 3 },
  sceneRowTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  sceneRowDetail: { color: "#7a817d", fontSize: 11, fontFamily: fonts.regular },
});
