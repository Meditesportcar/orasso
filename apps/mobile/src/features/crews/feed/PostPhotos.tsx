// Photos d'une publication du fil (lot R5c1, `.r5pph` de la maquette R5.7) : au format d'origine, jamais recadrées
// (D36) ; plusieurs photos en défilement horizontal avec « 1 / 2 ». Le cadre prend la forme de la première photo,
// bornée entre 4:5 et 1,91:1 ; une photo plus allongée s'y loge entière, sur fond sombre. Les images sont privées :
// servies par l'API au membre connecté seulement, gardées en mémoire seulement (`CrewPhotoImage`, tour 2).
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { type CrewPostPhoto, crewFeedLabels, crewPhotoFrameRatio } from "@orasso/shared";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { CrewPhotoImage } from "./CrewPhotoImage";

export function PostPhotos({ photos, pseudo }: { photos: CrewPostPhoto[]; pseudo: string }) {
  const { t } = useTheme();
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const ratio = crewPhotoFrameRatio(photos[0]);
  const height = width > 0 ? width / ratio : 0;
  const n = photos.length;
  return (
    <View
      style={[styles.frame, { aspectRatio: ratio, backgroundColor: t.color.night }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      testID="crew-post-photos"
    >
      {width > 0 ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={32}
          onScroll={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / width);
            if (i !== index && i >= 0 && i < n) setIndex(i);
          }}
          accessibilityLabel={crewFeedLabels.photoOf(index + 1, n)}
        >
          {photos.map((p, i) => (
            <View key={p.id} style={{ width, height }}>
              <CrewPhotoImage
                url={p.url}
                style={{ width, height }}
                accessibilityLabel={crewFeedLabels.photoAlt(pseudo, i + 1, n)}
              />
            </View>
          ))}
        </ScrollView>
      ) : null}
      {n > 1 ? (
        <View style={[styles.count, { backgroundColor: `${t.color.night}b3` }]} pointerEvents="none">
          <Text variant="caption" color={t.color.nightInk} style={styles.countText} testID="crew-post-photo-count">
            {crewFeedLabels.photoOf(index + 1, n)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: "100%", borderRadius: tokens.radius.radiusMd + 2, overflow: "hidden" },
  count: {
    position: "absolute",
    top: 10,
    right: 10,
    height: 24,
    paddingHorizontal: 9,
    borderRadius: tokens.radius.radiusPill,
    justifyContent: "center",
  },
  countText: { fontFamily: "Archivo-ExtraBold", fontSize: 11.5 },
});
