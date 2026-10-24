import { useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { Icon } from "@/components/common";
import type { ConversationPhase } from "@/hooks/useSimulationConversation";
import { colors, fonts } from "@/theme";

const HINT: Record<ConversationPhase, string> = {
  idle: "Mantén presionado para preguntar",
  recording: "Te escucho… suelta para enviar",
  sending: "Pensando la respuesta…",
  speaking: "Respondiendo · mantén presionado para interrumpir",
};

type Props = {
  phase: ConversationPhase;
  onPressIn: () => void;
  onPressOut: () => void;
};

export function PushToTalkButton({ phase, onPressIn, onPressOut }: Props) {
  const recording = phase === "recording";
  const busy = phase === "sending";
  // Si el dedo sigue apoyado: evita avisar dos veces el fin (al soltar y si el sistema cancela el toque)
  const holding = useRef(false);
  useEffect(() => {
    if (__DEV__) console.log("[PTT] montado");
    return () => {
      if (__DEV__) console.log("[PTT] desmontado");
    };
  }, []);

  function release(reason: string) {
    if (__DEV__) console.log("[PTT] fin del toque", reason, holding.current);
    if (!holding.current) return;
    holding.current = false;
    onPressOut();
  }

  return (
    <View style={styles.wrap}>
      {/* Responder propio en vez de Pressable: Pressable da el toque por terminado si el dedo se corre
          un poco fuera del botón o si otra vista pide el toque, y cortaba la pregunta antes de soltar.
          Aquí se graba mientras el dedo siga apoyado, se mueva a donde se mueva */}
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel="Mantén presionado para preguntar"
        accessibilityState={{ busy, disabled: busy }}
        hitSlop={12}
        onStartShouldSetResponder={() => !busy}
        onResponderGrant={() => {
          if (__DEV__) console.log("[PTT] toque");
          holding.current = true;
          onPressIn();
        }}
        onResponderRelease={() => release("soltó")}
        // No le cede el toque a nadie mientras se graba
        onResponderTerminationRequest={() => false}
        onResponderTerminate={() => release("cancelado por el sistema")}
        style={[styles.ring, recording && styles.ringRecording]}
      >
        <View style={[styles.button, recording && styles.buttonRecording, busy && styles.buttonBusy]}>
          {busy ? <ActivityIndicator color="white" /> : <Icon name="mic" size={28} color="white" />}
        </View>
      </View>
      <Text style={styles.hint}>{HINT[phase]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 10 },
  ring: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.85)",
    padding: 6,
  },
  ringRecording: { borderColor: colors.orange, transform: [{ scale: 1.08 }] },
  button: {
    flex: 1,
    borderRadius: 36,
    backgroundColor: colors.orange,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonRecording: { backgroundColor: "#c94f22" },
  buttonBusy: { opacity: 0.7 },
  hint: { color: "#c7cfca", fontSize: 11, fontFamily: fonts.regular, textAlign: "center" },
});
