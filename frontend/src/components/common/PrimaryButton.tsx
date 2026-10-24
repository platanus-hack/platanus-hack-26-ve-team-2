import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { colors, fonts } from "@/theme";

type Props = {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function PrimaryButton({ children, onPress, style }: Props) {
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
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
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
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  label: { color: "white", fontFamily: fonts.bold, fontSize: 16 },
});
