import { ViroARSceneNavigator } from "@reactvision/react-viro";
import { StyleSheet, Text, View } from "react-native";

import { HelloARScene } from "@/components/hello-ar-scene";
import { useApiHealth } from "@/hooks/use-api-health";

export default function Index() {
  const apiStatus = useApiHealth();

  return (
    <View style={styles.container}>
      <ViroARSceneNavigator
        autofocus
        initialScene={{ scene: HelloARScene }}
        style={styles.container}
      />
      <View style={styles.badge} pointerEvents="none">
        <Text style={styles.badgeText}>API: {apiStatus}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  badge: {
    position: "absolute",
    top: 60,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  badgeText: { color: "white", fontSize: 14 },
});
