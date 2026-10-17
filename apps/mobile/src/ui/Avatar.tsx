// Avatar rond : la photo du compte, ou l'initiale du pseudo sur la plaque graphite.
import { Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import { StyleSheet, View } from "react-native";

import { mediaSource } from "@/lib/media";

export function Avatar({ url, pseudo, size = 26 }: { url?: string | null; pseudo?: string | null; size?: number }) {
  const { t } = useTheme();
  const source = mediaSource(url);
  return (
    <View
      style={[styles.round, { width: size, height: size, backgroundColor: t.color.surfaceRaised }]}
      accessibilityElementsHidden
    >
      {source ? (
        <Photo source={source} style={{ width: size, height: size }} />
      ) : (
        <Text variant="credit" color={t.color.accent}>
          {(pseudo ?? "?").charAt(0)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  round: { borderRadius: tokens.radius.radiusPill, overflow: "hidden", alignItems: "center", justifyContent: "center" },
});
