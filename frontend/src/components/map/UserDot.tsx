import { StyleSheet, View } from "react-native";

import { colors } from "@/theme";

export function UserDot() {
  return (
    <View style={styles.wrap}>
      <View style={styles.halo} />
      <View style={styles.dot} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 72, height: 72, alignItems: "center", justifyContent: "center" },
  halo: {
    position: "absolute",
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(59,136,232,0.16)",
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.blue,
    borderWidth: 4,
    borderColor: "white",
  },
});
