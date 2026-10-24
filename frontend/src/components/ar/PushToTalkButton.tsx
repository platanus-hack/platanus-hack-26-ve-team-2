import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

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

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mantén presionado para preguntar"
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        hitSlop={12}
        style={[styles.ring, recording && styles.ringRecording]}
      >
        <View style={[styles.button, recording && styles.buttonRecording, busy && styles.buttonBusy]}>
          {busy ? <ActivityIndicator color="white" /> : <Icon name="mic" size={28} color="white" />}
        </View>
      </Pressable>
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
