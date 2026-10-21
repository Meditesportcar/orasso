// Tête de la fiche événement (lot 44 ; reproduite au lot C2b d'après `.ev-hero` de `s-event`) : pleine largeur, 4:5,
// 470 px au plus, fond de barre ; l'affiche générée commence à 62 px du haut (place de la pastille O et de la croix
// flottantes) et fond vers le fond de page sur ses 14 % du bas. Sans affiche générée, le gabarit « Minimal » (jamais
// de rectangle vide).
import { Photo, useTheme } from "@orasso/design-system/native";
import type { EventPublic } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { MinimalPoster } from "@/features/explorer/EventCardV2";
import { heroPoster } from "@/features/explorer/poster";
import { mediaSource } from "@/lib/media";

export function EventHero({ event }: { event: EventPublic }) {
  const { t } = useTheme();
  // Seulement l'affiche générée : l'affiche perso de l'organisateur reste dans le détail (`CustomPoster`).
  const url = heroPoster(event);
  return (
    <View style={styles.hero} testID="event-hero">
      <View style={styles.poster}>
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
      <View style={styles.fade} pointerEvents="none">
        <Photo
          placeholder={`linear-gradient(180deg, ${t.color.ground}00 0%, ${t.color.ground} 100%)`}
          style={StyleSheet.absoluteFill}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { width: "100%", aspectRatio: 4 / 5, maxHeight: 470, overflow: "hidden" },
  poster: { position: "absolute", top: 62, left: 0, right: 0, bottom: 0, overflow: "hidden" },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0, height: "14%" },
});
