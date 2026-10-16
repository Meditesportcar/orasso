// Logo carré d'un crew (lot 19) : l'image, ou l'initiale du nom sur la plaque graphite.
import { Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import { StyleSheet, View } from "react-native";

import { mediaSource } from "@/lib/media";

export function CrewLogo({ url, name, size = 40 }: { url: string | null; name: string; size?: number }) {
  const { t } = useTheme();
  const source = mediaSource(url);
  return (
    <View
      style={[styles.square, { width: size, height: size, backgroundColor: t.color.surfaceRaised }]}
      accessibilityElementsHidden
    >
      {source ? (
        <Photo source={source} style={{ width: size, height: size }} />
      ) : (
        <Text variant="credit" color={t.color.accent}>
          {name.charAt(0).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  square: {
    borderRadius: tokens.radius.radiusMd,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
});
