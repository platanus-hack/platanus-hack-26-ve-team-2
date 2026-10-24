import { StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "@/theme";

type Props = { title: string; subtitle: string; dark?: boolean };

export function StatusRow({ title, subtitle, dark }: Props) {
  return (
    <View style={styles.status}>
      <View style={styles.pulseDot} />
      <View>
        <Text style={[styles.title, dark && { color: "white" }]}>{title}</Text>
        <Text style={[styles.subtitle, dark && { color: "#c4ccc7" }]}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  title: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  subtitle: { fontFamily: fonts.regular, fontSize: 11, color: "#707873", marginTop: 2 },
});
