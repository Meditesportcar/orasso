// La grille de deux (maquette R8.6 `tile2`) : photo en 4:5, dessous la date puis le lieu ; **aucune pastille** (le rattachement
// à un événement se lit dans la publication ouverte). Toucher une vignette ouvre la publication seule. Les images ne se chargent
// que près de l'écran (`useNearScreen`) ; la publication « affiche » (`visual: "event_poster"`) montre l'affiche de son événement.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type FeedPostView, publicationsLabels as L, publicationPath, tileMeta } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { CrewPhotoImage } from "@/features/crews/feed/CrewPhotoImage";
import { now } from "@/lib/clock";
import { useNearScreen, useScrollTick } from "./useNearScreen";

const { space1, space2, space3, space4 } = tokens.spacing;
const { radiusMd } = tokens.radius;
/** La vignette est un 4:5 (largeur sur hauteur). */
const TILE_RATIO = 4 / 5;

function Tile({ post, tick }: { post: FeedPostView; tick: number }) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const box = useRef<View>(null);
  const near = useNearScreen(box, tick);
  const meta = tileMeta(post, now());
  const photo = post.photos[0];
  const label = `${L.openPost}, ${L.tileLabel(meta.date, meta.place)}`;
  return (
    <View style={styles.tile} testID="publication-tile">
      <Pressable
        ref={box}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => router.push(publicationPath(post.id) as never)}
        style={({ pressed }) => [styles.photo, { backgroundColor: c.surface }, pressed && styles.pressed]}
        testID="publication-tile-open"
      >
        {photo && near ? <CrewPhotoImage url={photo.url} style={styles.image} resizeMode="cover" /> : null}
      </Pressable>
      <View style={[styles.caption, { backgroundColor: c.surface, borderColor: c.line }]}>
        <Text variant="bodyStrong" color={c.ink} testID="publication-tile-date">
          {meta.date}
        </Text>
        {meta.place ? (
          <View style={styles.placeRow}>
            <Icon name="place" size={12} color={c.inkMuted} />
            <Text variant="caption" color={c.inkMuted} style={styles.place} testID="publication-tile-place">
              {meta.place}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function PublicationsGrid({ posts }: { posts: readonly FeedPostView[] }) {
  const tick = useScrollTick();
  const rows: FeedPostView[][] = [];
  for (let i = 0; i < posts.length; i += 2) rows.push(posts.slice(i, i + 2));
  return (
    <View style={styles.grid} testID="publications-grid">
      {rows.map((row) => (
        <View key={row[0]?.id} style={styles.row}>
          {row.map((post) => (
            <Tile key={post.id} post={post} tick={tick} />
          ))}
          {row.length === 1 ? <View style={styles.tile} /> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: space4 },
  row: { flexDirection: "row", gap: space3 },
  tile: { flex: 1, minWidth: 0, gap: space2 },
  photo: { width: "100%", aspectRatio: TILE_RATIO, borderRadius: radiusMd, overflow: "hidden" },
  image: { width: "100%", height: "100%" },
  pressed: { opacity: 0.85 },
  // La date et le lieu dans une petite plaque arrondie sous la photo (la maquette R8.6 la dessine ainsi : fond de carte, trait de 1,5 px).
  caption: {
    paddingHorizontal: space2,
    paddingVertical: space1,
    borderRadius: tokens.radius.radiusMd,
    borderWidth: 1.5,
  },
  placeRow: { flexDirection: "row", alignItems: "center", gap: space1 },
  place: { flexShrink: 1 },
});
