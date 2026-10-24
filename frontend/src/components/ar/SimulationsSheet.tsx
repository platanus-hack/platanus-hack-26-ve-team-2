import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CircleButton, Icon } from "@/components/common";
import { colors, fonts } from "@/theme";
import type { SimulationSummary } from "@/types/region";

type Props = {
  visible: boolean;
  siteName: string;
  simulations: SimulationSummary[];
  currentId: string;
  onSelect: (simulationId: string) => void;
  onClose: () => void;
};

export function SimulationsSheet({ visible, siteName, simulations, currentId, onSelect, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 25 }]} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <View>
              <Text style={styles.eyebrow}>{siteName.toUpperCase()}</Text>
              <Text style={styles.title}>Elige una simulación</Text>
            </View>
            <CircleButton label="Cerrar" variant="muted" onPress={onClose}>
              <Icon name="x" />
            </CircleButton>
          </View>
          {simulations.map((item, i) => {
            const isCurrent = currentId === item.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
                onPress={() => onSelect(item.id)}
              >
                <Text style={styles.num}>0{i + 1}</Text>
                <View style={styles.info}>
                  <Text style={[styles.rowTitle, isCurrent && { color: "#c76035" }]}>{item.title}</Text>
                  {item.space === "open" && <Text style={styles.badge}>ESPACIO ABIERTO · ~20 M</Text>}
                  <Text style={styles.rowDetail}>{item.description}</Text>
                </View>
                <Icon name="chevron" />
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(9,17,13,0.71)" },
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
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  eyebrow: { color: "#a35f3d", fontSize: 9, letterSpacing: 1.4, fontFamily: fonts.bold },
  title: { fontFamily: fonts.display, fontSize: 22, marginTop: 4, color: colors.ink },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#deddd7",
    paddingVertical: 14,
    paddingHorizontal: 2,
  },
  num: { width: 40, fontFamily: fonts.displayBold, fontSize: 12, color: "#999e9a" },
  info: { flex: 1, gap: 3 },
  rowTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  badge: {
    alignSelf: "flex-start",
    color: "#a35f3d",
    backgroundColor: "#f1e3d6",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 9,
    letterSpacing: 0.8,
    fontFamily: fonts.bold,
    overflow: "hidden",
  },
  rowDetail: { color: "#7a817d", fontSize: 11, fontFamily: fonts.regular },
});
