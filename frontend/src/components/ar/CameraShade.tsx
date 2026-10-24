import { StyleSheet } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

// Degradado superior/inferior para que el HUD se lea sobre la cámara (deja despejado el centro, donde va el personaje)
export function CameraShade() {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#12231d" stopOpacity={0.55} />
          <Stop offset="0.22" stopColor="#12231d" stopOpacity={0} />
          <Stop offset="0.68" stopColor="#08110e" stopOpacity={0} />
          <Stop offset="1" stopColor="#08110e" stopOpacity={0.8} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#shade)" />
    </Svg>
  );
}
