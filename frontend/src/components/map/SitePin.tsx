import { StyleSheet, View } from "react-native";

import { Icon } from "@/components/common";
import { colors } from "@/theme";

// La punta del pin rotado queda en ~97% de la altura del contenedor
export const PIN_ANCHOR = { x: 0.5, y: 0.97 };

// Pin en forma de gota (esquina inferior izquierda recortada y rotada -45°)
export function SitePin({ active }: { active: boolean }) {
  const size = active ? 51 : 40;
  return (
    <View style={[styles.wrap, { width: size * 1.5, height: size * 1.5 }]}>
      <View
        style={[
          styles.pin,
          { width: size, height: size, backgroundColor: active ? colors.orange : colors.green },
        ]}
      >
        <View style={styles.icon}>
          <Icon name="camera" size={17} color="white" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  pin: {
    borderWidth: 4,
    borderColor: "white",
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
    borderBottomLeftRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-45deg" }],
    shadowColor: "#132a22",
    shadowOpacity: 0.25,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  icon: { transform: [{ rotate: "45deg" }] },
});
