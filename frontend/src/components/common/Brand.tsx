import { Image, StyleSheet } from "react-native";

import arviLogo from "@/assets/images/arvi-logo.png";

// Proporción del PNG (1286 × 403): el ancho se calcula a partir del alto
const LOGO_ASPECT = 1286 / 403;
const LOGO_HEIGHT = 24;

/** Logo de ARVI (la V es una A invertida), con fondo transparente para ir sobre el mapa. */
export function Brand() {
  return <Image source={arviLogo} style={styles.logo} resizeMode="contain" accessibilityRole="image" accessibilityLabel="ARVI" />;
}

const styles = StyleSheet.create({
  logo: { height: LOGO_HEIGHT, width: LOGO_HEIGHT * LOGO_ASPECT },
});
