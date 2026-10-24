import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, fonts } from "@/lib/theme";

type CircleButtonProps = {
  children: ReactNode;
  label: string;
  variant?: "solid" | "glass" | "muted" | "white";
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function CircleButton({ children, label, variant = "solid", onPress, style }: CircleButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.circle, styles[variant], pressed && styles.pressed, style]}
    >
      {children}
    </Pressable>
  );
}

type PrimaryButtonProps = {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function PrimaryButton({ children, onPress, style }: PrimaryButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.primary, pressed && styles.pressed, style]}
    >
      {children}
    </Pressable>
  );
}

export function PrimaryLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.primaryLabel}>{children}</Text>;
}

type StatusRowProps = { title: string; subtitle: string; dark?: boolean };

export function StatusRow({ title, subtitle, dark }: StatusRowProps) {
  return (
    <View style={styles.status}>
      <View style={styles.pulseDot} />
      <View>
        <Text style={[styles.statusTitle, dark && { color: "white" }]}>{title}</Text>
        <Text style={[styles.statusSubtitle, dark && { color: "#c4ccc7" }]}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  solid: {
    backgroundColor: "rgba(255,255,255,0.92)",
    shadowColor: "#19261e",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  white: {
    backgroundColor: "white",
    shadowColor: "#526057",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  glass: {
    backgroundColor: "rgba(19,33,27,0.6)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  muted: { backgroundColor: "#edece7" },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  primary: {
    height: 52,
    paddingHorizontal: 17,
    borderRadius: 15,
    backgroundColor: colors.orange,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: "#cb562b",
    shadowOpacity: 0.21,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  primaryLabel: { color: "white", fontFamily: fonts.bold, fontSize: 16 },
  status: { flexDirection: "row", alignItems: "center", gap: 11 },
  pulseDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.success,
    borderWidth: 0,
    // halo del CSS original (box-shadow 0 0 0 6px)
    outlineColor: colors.successHalo,
    outlineWidth: 6,
    outlineStyle: "solid",
    marginHorizontal: 6,
  },
  statusTitle: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  statusSubtitle: { fontFamily: fonts.regular, fontSize: 11, color: "#707873", marginTop: 2 },
});
