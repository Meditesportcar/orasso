// Haut de la fiche événement v2 (lot 44, `s-event`) : l'affiche générée en vedette, la même que sur la carte de
// l'Explorer (post 4:5) ; sans affiche générée, le gabarit « Minimal » (jamais de rectangle vide). Le titre de la fiche
// est posé sous l'affiche, sur le fond : pas de contour nécessaire.
import { Photo, tokens } from "@orasso/design-system/native";
import type { EventPublic } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { MinimalPoster } from "@/features/explorer/EventCardV2";
import { mediaSource } from "@/lib/media";

export function EventHero({ event }: { event: EventPublic }) {
  const url = event.poster?.postUrl ?? event.posterUrl;
  return (
    <View style={styles.hero} testID="event-hero">
      {url ? (
        <Photo
          source={mediaSource(url)}
          accessibilityLabel={`Affiche : ${event.title}`}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <MinimalPoster event={event} big />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    width: "100%",
    aspectRatio: 4 / 5,
    maxHeight: 470,
    borderRadius: tokens.radius.radiusMd,
    overflow: "hidden",
  },
});
