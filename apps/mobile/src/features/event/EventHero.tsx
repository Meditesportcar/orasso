// Tête de la fiche événement (lot 44 ; reproduite au lot C2b d'après `.ev-hero` de `s-event`) : pleine largeur, 4:5,
// fond de barre ; l'affiche générée (entière, 4:5) commence à 62 px sous la barre d'état (place de la pastille O et de
// la croix flottantes) et fond vers le fond de page sur ses 14 % du bas. Sans affiche générée, le gabarit « Minimal »
// (jamais de rectangle vide).
// Lot M3 (fluidité) : la tête s'affiche aussi avec la seule carte de la liste (aperçu, avant la réponse de l'API : même
// image, `generatedPosterUrl` et `poster.postUrl` sortent de la même clé) ; l'affiche touchée grandit de sa place dans
// la liste jusqu'à l'en-tête (`from`, `base`, courbe « park »), sans transition si les animations sont réduites. La
// tête commence sous la barre d'état (zone sûre) : plus rien ne passe sous l'heure et la batterie.
import { duration, Photo, useTheme } from "@orasso/design-system/native";
import type { EventCard, EventPublic } from "@orasso/shared";
import { useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MinimalPoster } from "@/features/explorer/EventCardV2";
import { cardPoster, heroPoster } from "@/features/explorer/poster";
import type { PosterRect } from "@/lib/eventPreview";
import { mediaSource } from "@/lib/media";

/** Place des boutons flottants au-dessus de l'affiche (`.ev-hero` : 62 px). */
const HERO_TOP = 62;
const parkCurve = Easing.bezier(0.12, 0.75, 0.25, 1);

export function EventHero({ event, from = null }: { event: EventPublic | EventCard; from?: PosterRect | null }) {
  const { t, reducedMotion } = useTheme();
  const insets = useSafeAreaInsets();
  // Seulement l'affiche générée : l'affiche perso de l'organisateur reste dans le détail (`CustomPoster`).
  const url = "poster" in event ? heroPoster(event) : cardPoster(event);
  const grow = useRef(new Animated.Value(from && !reducedMotion ? 0 : 1)).current;
  // Départ de la transition : en attente de la mesure de l'en-tête (`pending`), puis calculé.
  const [start, setStartState] = useState<{ pending: boolean; value: Start | null }>(() => ({
    pending: Boolean(from && !reducedMotion),
    value: null,
  }));
  const setStart = (value: Start) => setStartState({ pending: false, value });
  const posterRef = useRef<View>(null);
  const onLayout = () => {
    if (!start.pending) return;
    posterRef.current?.measureInWindow((x, y, width, height) => {
      if (!from || width <= 0) {
        setStartState({ pending: false, value: null });
        return;
      }
      // Échelle unique (pas de déformation) : la largeur de l'affiche touchée ; centres alignés.
      const scale = from.width / width;
      setStart({
        dx: from.x + from.width / 2 - (x + width / 2),
        dy: from.y + from.height / 2 - (y + height / 2),
        scale,
      });
      Animated.timing(grow, {
        toValue: 1,
        duration: duration.base,
        easing: parkCurve,
        useNativeDriver: true,
      }).start();
    });
  };
  const transform = start.value
    ? [
        { translateX: grow.interpolate({ inputRange: [0, 1], outputRange: [start.value.dx, 0] }) },
        { translateY: grow.interpolate({ inputRange: [0, 1], outputRange: [start.value.dy, 0] }) },
        { scale: grow.interpolate({ inputRange: [0, 1], outputRange: [start.value.scale, 1] }) },
      ]
    : undefined;
  return (
    <View style={[styles.hero, { paddingTop: insets.top + HERO_TOP }]} testID="event-hero">
      <Animated.View
        ref={posterRef}
        collapsable={false}
        onLayout={onLayout}
        style={[styles.poster, transform ? { transform } : null, start.pending ? styles.waiting : null]}
      >
        {url ? (
          <Photo
            source={mediaSource(url)}
            accessibilityLabel={`Affiche : ${event.title}`}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <MinimalPoster event={event} big />
        )}
      </Animated.View>
      <View style={styles.fade} pointerEvents="none">
        <Photo
          placeholder={`linear-gradient(180deg, ${t.color.ground}00 0%, ${t.color.ground} 100%)`}
          style={StyleSheet.absoluteFill}
        />
      </View>
    </View>
  );
}

type Start = { dx: number; dy: number; scale: number };

const styles = StyleSheet.create({
  // Pas de découpe : l'affiche part de sa place dans la liste, souvent sous l'en-tête.
  hero: { width: "100%" },
  poster: { width: "100%", aspectRatio: 4 / 5, overflow: "hidden", zIndex: 2 },
  // Avant la mesure (une image au plus) : l'affiche ne se montre pas en grand avant de partir de la liste.
  waiting: { opacity: 0 },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0, height: "14%" },
});
