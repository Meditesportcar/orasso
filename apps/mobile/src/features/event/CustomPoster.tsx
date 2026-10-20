// « Affiche de l'organisateur » (lot 44, `s-event` ; `customPosterUrl` du lot 47) : l'affiche perso vit dans le détail
// de la fiche ; la toucher l'ouvre en grand. Sur les cartes, c'est l'affiche générée.
import { Icon, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { eventPageLabels as L } from "@orasso/shared";
import { useState } from "react";
import { Image, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";

import { AppSheet } from "@/ui/AppSheet";

const { space1, space2, space3 } = tokens.spacing;

export function CustomPoster({ url, structureName }: { url: string; structureName: string }) {
  const { t } = useTheme();
  const [open, setOpen] = useState(false);
  const { height } = useWindowDimensions();
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${L.customPoster} : ${structureName}`}
        onPress={() => setOpen(true)}
        testID="custom-poster"
      >
        <Plate style={styles.row}>
          <Image source={{ uri: url }} style={styles.thumb} resizeMode="cover" accessibilityIgnoresInvertColors />
          <View style={styles.text}>
            <Text variant="label" color={t.color.plateMuted}>
              {L.customPoster}
            </Text>
            <Text variant="bodyStrong" color={t.color.plateInk}>
              {structureName}
            </Text>
            <Text variant="meta" color={t.color.plateMuted}>
              {L.customPosterHint}
            </Text>
          </View>
          <Icon name="next" size={20} color={t.color.plateInk} />
        </Plate>
      </Pressable>
      <AppSheet visible={open} onClose={() => setOpen(false)} accessibilityLabel={L.customPoster} maxHeight={0.92}>
        <Text variant="title" color={t.color.ink}>
          {L.customPoster}
        </Text>
        <Image
          source={{ uri: url }}
          style={[styles.full, { height: height * 0.6 }]}
          resizeMode="contain"
          accessibilityLabel={`${L.customPoster} : ${structureName}`}
        />
        <Text variant="meta" color={t.color.inkMuted}>
          {L.customPosterSheet}
        </Text>
      </AppSheet>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space3, padding: space2 },
  thumb: { width: 86, height: 108, borderRadius: tokens.radius.radiusSm },
  text: { flex: 1, gap: space1 },
  full: { width: "100%", borderRadius: tokens.radius.radiusSm },
});
