// Le rail « Ça plaît en ce moment » (lot R8c2, maquette R8.3 `hotRail`) : en tête d'« Abonnements » et d'« Autour de moi »,
// des vignettes en défilement horizontal (la photo, l'auteur, le nombre de flammes des 7 derniers jours) ; toucher ouvre la
// publication. Jamais dans « Pour toi ». Les photos viennent de la route privée des publications (jeton de session).
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type FeedCard, feedScreenLabels as L } from "@orasso/shared";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { CrewPhotoImage } from "@/features/crews/feed/CrewPhotoImage";

const { space1, space2 } = tokens.spacing;
/** Largeur d'une vignette (maquette : 112 px, 4:5). */
const TILE_W = 112;
const TILE_H = Math.round((TILE_W * 5) / 4);

export function HotRail({
  cards,
  scope,
  onOpen,
}: {
  cards: readonly FeedCard<"feed_post">[];
  scope: "nearby" | "following";
  onOpen: (card: FeedCard<"feed_post">) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  if (cards.length === 0) return null;
  return (
    <View style={styles.box} testID="fil-hot">
      <View style={styles.head} accessibilityRole="header">
        <Icon name="fire" size={16} color={c.accentText} />
        <Text variant="label" color={c.ink} style={styles.title}>
          {L.hotTitle}
        </Text>
        <Text variant="caption" color={c.inkMuted} style={styles.scope}>
          {L.hotScope[scope]}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        testID="fil-hot-rail"
      >
        {cards.map((card) => {
          const post = card.payload.post;
          const photo = post.photos[0];
          return (
            <Pressable
              key={card.id}
              accessibilityRole="button"
              accessibilityLabel={L.hotOpen(post.author.pseudo, post.reactionsCount)}
              onPress={() => onOpen(card)}
              style={[styles.tile, { backgroundColor: c.surfaceRaised }]}
              testID="fil-hot-tile"
            >
              {photo ? (
                <CrewPhotoImage
                  url={photo.url}
                  style={styles.photo}
                  resizeMode="cover"
                  accessibilityLabel={L.photoAlt(post.author.pseudo, 1, 1)}
                />
              ) : null}
              <View style={[styles.who, { backgroundColor: `${c.night}b3` }]}>
                <Text variant="caption" color={c.nightInk} style={styles.whoText}>
                  {post.author.pseudo}
                </Text>
              </View>
              <View style={[styles.flames, { backgroundColor: c.accent }]}>
                <Icon name="fire" size={13} color={c.accentInk} />
                <Text variant="caption" color={c.accentInk} style={styles.flamesText}>
                  {String(post.reactionsCount)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space2 },
  head: { flexDirection: "row", alignItems: "center", gap: space2 },
  title: { fontSize: 12, letterSpacing: 1 },
  scope: { marginLeft: "auto", fontSize: 12 },
  rail: { gap: space2, paddingRight: space1 },
  tile: { width: TILE_W, height: TILE_H, borderRadius: tokens.radius.radiusMd, overflow: "hidden" },
  photo: { position: "absolute", left: 0, top: 0, width: TILE_W, height: TILE_H },
  who: { position: "absolute", left: 0, right: 0, top: 0, paddingHorizontal: 6, paddingVertical: 5 },
  whoText: { fontFamily: "Archivo-ExtraBold", fontSize: 11 },
  flames: {
    position: "absolute",
    left: 5,
    bottom: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  flamesText: { fontFamily: "Archivo-ExtraBold", fontSize: 10.5 },
});
