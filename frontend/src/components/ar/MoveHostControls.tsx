import { useState } from "react";
import {
  type GestureResponderEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { CircleButton, Icon } from "@/components/common";
import {
  arSession,
  MAX_FIELD_SCALE,
  MAX_SIZE_SCALE,
  MIN_FIELD_SCALE,
  MIN_SIZE_SCALE,
  useArSession,
} from "@/hooks/useArSession";
import { colors, fonts } from "@/theme";

// Cuánto gira (grados) cada toque de los botones ⟲ / ⟳
const ROTATE_STEP = 30;
// Un toque (no un arrastre): el dedo se movió menos que esto (px) y se levantó antes de este tiempo (ms)
const TAP_SLOP = 10;
const TAP_MAX_MS = 350;

type Touch = { pageX: number; pageY: number };

/** Ángulo (grados) de la recta entre dos dedos, en la pantalla */
function fingersAngle([a, b]: Touch[]): number {
  return (Math.atan2(b.pageY - a.pageY, b.pageX - a.pageX) * 180) / Math.PI;
}

/**
 * Superficie a pantalla completa del modo "mover": tocar el piso lo lleva ahí (aunque esté fuera de
 * la vista), deslizar un dedo lo ajusta (derecha/izquierda, arriba = alejarlo, abajo = acercarlo) y
 * girar dos dedos lo orienta.
 */
export function MoveSurface() {
  const [responder] = useState(() => {
    // Último punto (un dedo) o ángulo (dos dedos) procesado; se reinicia al cambiar la cantidad de dedos
    const last: {
      current: { fingers: number; x: number; y: number; angle: number } | null;
    } = { current: null };
    // Dónde y cuándo empezó el gesto, y si en algún momento hubo dos dedos: para reconocer un toque
    const start = { x: 0, y: 0, at: 0, multi: false };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event: GestureResponderEvent) => {
        last.current = null;
        start.x = event.nativeEvent.pageX;
        start.y = event.nativeEvent.pageY;
        start.at = Date.now();
        start.multi = false;
      },
      onPanResponderMove: (event: GestureResponderEvent) => {
        const touches = event.nativeEvent.touches as Touch[];
        if (!touches.length) return;
        const fingers = Math.min(touches.length, 2);
        if (fingers === 2) start.multi = true;
        const x = touches[0].pageX;
        const y = touches[0].pageY;
        const angle = fingers === 2 ? fingersAngle(touches) : 0;
        const prev = last.current;
        last.current = { fingers, x, y, angle };
        if (!prev || prev.fingers !== fingers) return;
        if (fingers === 2) {
          // Girar los dedos en sentido horario lo gira en sentido horario visto desde arriba
          let delta = angle - prev.angle;
          if (delta > 180) delta -= 360;
          if (delta < -180) delta += 360;
          if (delta !== 0)
            arSession.controlHost({ type: "rotate", degrees: -delta });
        } else if (x !== prev.x || y !== prev.y) {
          arSession.controlHost({
            type: "move",
            right: x - prev.x,
            up: prev.y - y,
          });
        }
      },
      onPanResponderRelease: (_event: GestureResponderEvent, gesture) => {
        last.current = null;
        const tap =
          !start.multi &&
          Math.hypot(gesture.dx, gesture.dy) < TAP_SLOP &&
          Date.now() - start.at < TAP_MAX_MS;
        if (tap)
          arSession.controlHost({ type: "place", x: start.x, y: start.y });
      },
      onPanResponderTerminate: () => {
        last.current = null;
      },
    });
  });

  return <View style={StyleSheet.absoluteFill} {...responder.panHandlers} />;
}

/** Panel inferior del modo "mover": orientaciones rápidas, giro fino y "Listo". */
export function MovePanel() {
  const sizeScale = useArSession((s) => s.sizeScale);
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Ubica al personaje</Text>
      <Text style={styles.subtitle}>
        Toca el piso donde lo quieras o desliza el dedo para ajustarlo
      </Text>

      <View style={styles.faceRow}>
        <FaceOption label="De frente" side="front" />
        <FaceOption label="De lado" side="side" />
        <FaceOption label="De espaldas" side="back" />
      </View>

      {/* Si ARCore midió mal las distancias, aquí se calibra el tamaño: se mantiene toda la sesión */}
      <View style={styles.sizeRow}>
        <Text style={styles.sizeLabel}>Tamaño</Text>
        <SizeButton
          label="Más pequeño"
          sign="−"
          disabled={sizeScale <= MIN_SIZE_SCALE}
          onPress={() => arSession.resize(-1)}
        />
        <Text style={styles.sizeValue}>{Math.round(sizeScale * 100)} %</Text>
        <SizeButton
          label="Más grande"
          sign="+"
          disabled={sizeScale >= MAX_SIZE_SCALE}
          onPress={() => arSession.resize(1)}
        />
      </View>

      <View style={styles.actions}>
        <CircleButton
          label="Girar a la izquierda"
          variant="glass"
          onPress={() =>
            arSession.controlHost({ type: "rotate", degrees: ROTATE_STEP })
          }
        >
          <Icon name="rotateLeft" color="white" />
        </CircleButton>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Listo, terminar de mover"
          onPress={() => arSession.stopEditing()}
          style={({ pressed }) => [
            styles.done,
            pressed && { transform: [{ scale: 0.97 }] },
          ]}
        >
          <Text style={styles.doneText}>Listo</Text>
        </Pressable>
        <CircleButton
          label="Girar a la derecha"
          variant="glass"
          onPress={() =>
            arSession.controlHost({ type: "rotate", degrees: -ROTATE_STEP })
          }
        >
          <Icon name="rotateRight" color="white" />
        </CircleButton>
      </View>
    </View>
  );
}

/**
 * Tamaño de la escena de campo (las trincheras): arranca ajustado al piso detectado y aquí se agranda
 * o achica para que quepa en el lugar. Va junto a los botones de abajo: en esa escena no hay modo "mover"
 */
export function SceneSizeControl() {
  const scale = useArSession((s) => s.fieldScale);
  return (
    <View style={[styles.sizeRow, styles.sceneSize]}>
      <Text style={styles.sizeLabel}>Escena</Text>
      <SizeButton
        label="Escena más pequeña"
        sign="−"
        disabled={scale <= MIN_FIELD_SCALE}
        onPress={() => arSession.resize(-1)}
      />
      <Text style={styles.sizeValue}>{Math.round(scale * 100)} %</Text>
      <SizeButton
        label="Escena más grande"
        sign="+"
        disabled={scale >= MAX_FIELD_SCALE}
        onPress={() => arSession.resize(1)}
      />
    </View>
  );
}

function SizeButton({
  label,
  sign,
  disabled,
  onPress,
}: {
  label: string;
  sign: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.sizeButton,
        disabled && { opacity: 0.35 },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={styles.sizeSign}>{sign}</Text>
    </Pressable>
  );
}

function FaceOption({
  label,
  side,
}: {
  label: string;
  side: "front" | "side" | "back";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ponerlo ${label.toLowerCase()}`}
      onPress={() => arSession.controlHost({ type: "face", side })}
      style={({ pressed }) => [styles.face, pressed && { opacity: 0.7 }]}
    >
      <Text style={styles.faceText}>{label}</Text>
    </Pressable>
  );
}

const glass = {
  backgroundColor: "rgba(19,33,27,0.6)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.18)",
} as const;

const styles = StyleSheet.create({
  panel: { gap: 12 },
  title: {
    color: "white",
    fontFamily: fonts.displayBold,
    fontSize: 17,
    textAlign: "center",
  },
  subtitle: {
    color: "#c6cec9",
    fontSize: 12,
    fontFamily: fonts.regular,
    textAlign: "center",
    marginTop: -8,
  },
  faceRow: { flexDirection: "row", gap: 8, justifyContent: "center" },
  face: {
    ...glass,
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: "center",
  },
  faceText: { color: "white", fontSize: 13, fontFamily: fonts.medium },
  sizeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  sceneSize: {
    ...glass,
    alignSelf: "center",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  sizeLabel: {
    color: "#c6cec9",
    fontSize: 13,
    fontFamily: fonts.medium,
    marginRight: 4,
  },
  sizeButton: {
    ...glass,
    width: 40,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  sizeSign: {
    color: "white",
    fontSize: 20,
    fontFamily: fonts.bold,
    lineHeight: 22,
  },
  sizeValue: {
    color: "white",
    fontSize: 14,
    fontFamily: fonts.bold,
    minWidth: 52,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  done: {
    flex: 1,
    height: 48,
    borderRadius: 15,
    backgroundColor: colors.orange,
    alignItems: "center",
    justifyContent: "center",
  },
  doneText: { color: "white", fontSize: 15, fontFamily: fonts.bold },
});
