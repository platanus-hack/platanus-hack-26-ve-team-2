import type { ReactNode } from "react";
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

export type CircleButtonVariant = "solid" | "glass" | "muted" | "white";

type Props = {
  children: ReactNode;
  label: string;
  variant?: CircleButtonVariant;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function CircleButton({ children, label, variant = "solid", onPress, style }: Props) {
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
});
