import { StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "@/theme";

export function Brand() {
  return (
    <View style={styles.brand}>
      <View style={styles.mark}>
        <Text style={styles.markText}>V</Text>
      </View>
      <View>
        <Text style={styles.name}>VISTA</Text>
        <Text style={styles.tagline}>LA HISTORIA, VIVA</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  brand: { flexDirection: "row", alignItems: "center", gap: 9 },
  mark: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderBottomLeftRadius: 3,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-5deg" }],
  },
  markText: { color: "white", fontFamily: fonts.display, fontSize: 18 },
  name: { fontFamily: fonts.display, fontSize: 17, letterSpacing: 3, color: colors.green, lineHeight: 19 },
  tagline: { fontFamily: fonts.bold, fontSize: 8, letterSpacing: 1.9, color: colors.green },
});
