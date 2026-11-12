// La grille de deux (maquette R8.6 `tile2`) : photo en 4:5, dessous la date puis le lieu ; **aucune pastille** (le rattachement
// à un événement se lit dans la publication ouverte). Toucher une vignette ouvre la publication seule. Les images ne se chargent
// que près de l'écran (`useNearScreen`) ; la publication « affiche » (`visual: "event_poster"`) montre l'affiche de son événement.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  eventJournalLabels,
  type FeedPostView,
  publicationsLabels as L,
  publicationPath,
  tileMeta,
  withLabel,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { CrewPhotoImage } from "@/features/crews/feed/CrewPhotoImage";
import { now } from "@/lib/clock";
import { JournalBadges, type JournalOptions } from "./JournalBadges";
import { useNearScreen, useScrollTick } from "./useNearScreen";

const { space1, space2, space3, space4 } = tokens.spacing;
const { radiusMd } = tokens.radius;
/** La vignette est un 4:5 (largeur sur hauteur). */
const TILE_RATIO = 4 / 5;

function Tile({
  post,
  tick,
  authorKey,
  journal,
}: {
  post: FeedPostView;
  tick: number;
  authorKey?: string;
  journal?: JournalOptions;
}) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const box = useRef<View>(null);
  const near = useNearScreen(box, tick);
  const meta = tileMeta(post, now());
  const photo = post.photos[0];
  // Collaboration (R8o) : sur le profil de l'un, « Avec <l'autre> ».
  const with_ = authorKey ? withLabel(authorKey, post) : null;
  const label = `${L.openPost}, ${L.tileLabel(meta.date, meta.place)}${with_ ? `, ${with_}` : ""}`;
  return (
    <View style={styles.tile} testID="publication-tile">
      <Pressable
        ref={box}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={journal?.readOnly ? undefined : () => router.push(publicationPath(post.id) as never)}
        disabled={journal?.readOnly}
        style={({ pressed }) => [styles.photo, { backgroundColor: c.surface }, pressed && styles.pressed]}
        testID="publication-tile-open"
      >
        {photo && near ? <CrewPhotoImage url={photo.url} style={styles.image} resizeMode="cover" /> : null}
        {with_ ? (
          <View style={[styles.pin, { backgroundColor: `${c.night}d9` }]} testID="publication-tile-with">
            <Icon name="crew" size={12} color={c.nightInk} />
            <Text variant="caption" color={c.nightInk} style={styles.pinText}>
              {with_}
            </Text>
          </View>
        ) : null}
      </Pressable>
      {/* Lot R8d (journal d'un événement) : « Épinglée » et « Inscrits prévenus » sur la photo, le menu « … » de l'organisateur. */}
      {journal ? <JournalBadges post={post} floating /> : null}
      {journal?.onMenu ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={eventJournalLabels.menuOpen}
          onPress={() => journal.onMenu?.(post)}
          hitSlop={7}
          style={[styles.dots, { backgroundColor: c.scrim }]}
          testID="journal-tile-menu"
        >
          <Icon name="more" size={18} color={c.nightInk} />
        </Pressable>
      ) : null}
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

export function PublicationsGrid({
  posts,
  authorKey,
  journal,
}: {
  posts: readonly FeedPostView[];
  authorKey?: string;
  journal?: JournalOptions;
}) {
  const tick = useScrollTick();
  const rows: FeedPostView[][] = [];
  for (let i = 0; i < posts.length; i += 2) rows.push(posts.slice(i, i + 2));
  return (
    <View style={styles.grid} testID="publications-grid">
      {rows.map((row) => (
        <View key={row[0]?.id} style={styles.row}>
          {row.map((post) => (
            <Tile key={post.id} post={post} tick={tick} authorKey={authorKey} journal={journal} />
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
  // Le « … » de la maquette (`.r8dots`) : 30 px sur fond sombre translucide, la zone de toucher est portée à 44 px par hitSlop.
  dots: {
    position: "absolute",
    top: space1 + 2,
    right: space1 + 2,
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.85 },
  // La date et le lieu dans une petite plaque arrondie sous la photo (la maquette R8.6 la dessine ainsi : fond de carte, trait de 1,5 px).
  caption: {
    paddingHorizontal: space2,
    paddingVertical: space1,
    borderRadius: tokens.radius.radiusMd,
    borderWidth: 1.5,
  },
  // L'étiquette « Avec … » posée sur la photo (maquette R8.13 `r8pin`) : un nom ne se tronque jamais, elle passe à la ligne.
  pin: {
    position: "absolute",
    left: space2,
    top: space2,
    right: space2,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space1,
    paddingHorizontal: space2,
    paddingVertical: space1,
    borderRadius: tokens.radius.radiusSm,
  },
  pinText: { flexShrink: 1 },
  placeRow: { flexDirection: "row", alignItems: "center", gap: space1 },
  place: { flexShrink: 1 },
});
