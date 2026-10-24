import {
  ViroARScene,
  ViroText,
  ViroTrackingStateConstants,
} from "@reactvision/react-viro";
import { useState } from "react";
import { StyleSheet } from "react-native";

export function HelloARScene() {
  const [text, setText] = useState("Inicializando AR...");

  function onTrackingUpdated(state: unknown) {
    if (state === ViroTrackingStateConstants.TRACKING_NORMAL) {
      setText("Hola AR 🍌");
    } else if (state === ViroTrackingStateConstants.TRACKING_UNAVAILABLE) {
      setText("Tracking no disponible");
    }
  }

  return (
    <ViroARScene onTrackingUpdated={onTrackingUpdated}>
      <ViroText
        text={text}
        scale={[0.5, 0.5, 0.5]}
        position={[0, 0, -1]}
        style={styles.text}
      />
    </ViroARScene>
  );
}

const styles = StyleSheet.create({
  text: {
    fontFamily: "Arial",
    fontSize: 30,
    color: "#ffffff",
    textAlignVertical: "center",
    textAlign: "center",
  },
});
