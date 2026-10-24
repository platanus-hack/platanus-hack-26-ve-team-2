import { ActivityIndicator, StyleSheet, View } from "react-native";

import { Icon, PrimaryButton, PrimaryLabel, StatusRow } from "@/components/common";
import type { MicPermission } from "@/hooks/useMicrophonePermission";

type Props = {
  status: Exclude<MicPermission, "granted">;
  onRequest: () => void;
};

export function MicPermissionPrompt({ status, onRequest }: Props) {
  if (status === "checking") return <ActivityIndicator color="white" style={styles.loading} />;

  const blocked = status === "blocked";
  return (
    <View style={styles.wrap}>
      <StatusRow
        dark
        title="Necesitamos tu micrófono"
        subtitle={
          blocked
            ? "Actívalo en Ajustes para hablar con los personajes"
            : "Así puedes hacerle preguntas a los personajes"
        }
      />
      <PrimaryButton onPress={onRequest}>
        <Icon name="mic" color="white" />
        <PrimaryLabel>{blocked ? "Abrir Ajustes" : "Permitir micrófono"}</PrimaryLabel>
      </PrimaryButton>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  loading: { marginVertical: 30 },
});
