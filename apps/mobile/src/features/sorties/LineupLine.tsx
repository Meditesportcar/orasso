// La ligne « Le plateau » d'un ticket de Mes sorties (lot R4b, maquette R4.4) : trois mini-photos rondes, « Le plateau
// · 42 voitures » (sortie retenue à venir) ou « · 38 présentes » (sortie passée) ; elle ouvre directement le plateau.
// L'API la donne avec la liste (`lineupPreview`) : aucune requête par ticket. En attente ou liste d'attente : rien.
import { Icon, Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import { lineupLabels as L, type LineupPreview } from "@orasso/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { mediaSource } from "@/lib/media";
import { useOnTicketPoster } from "./Ticket";

const { space2 } = tokens.spacing;
const AVATAR = 26;

export function LineupLine({ slug, preview }: { slug: string; preview: LineupPreview | null | undefined }) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const onPoster = useOnTicketPoster();
  if (!preview || preview.count === 0) return null;
  const ink = onPoster ? c.posterInk : c.plateInk;
  const ring = onPoster ? c.poster : c.surface;
  const text = `${L.title} · ${preview.count} ${L.sortiesLine(preview.count, preview.phase)}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      onPress={() => router.push(`/e/${slug}/plateau`)}
      style={[styles.line, { backgroundColor: `${ink}12`, borderColor: `${ink}24` }]}
      testID="ticket-lineup"
    >
      <View style={styles.avatars}>
        {preview.photoUrls.map((url, i) => (
          <View
            key={url}
            style={[styles.avatar, { borderColor: ring, backgroundColor: c.surfaceRaised }, i > 0 && styles.overlap]}
          >
            <Photo source={mediaSource(url)} style={StyleSheet.absoluteFill} />
          </View>
        ))}
      </View>
      <Text variant="caption" color={ink} style={styles.text}>
        <Text variant="caption" color={ink} style={styles.strong}>
          {L.title}
        </Text>
        {` · ${preview.count} ${L.sortiesLine(preview.count, preview.phase)}`}
      </Text>
      <Icon name="next" size={16} color={ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    width: "100%",
    paddingVertical: 7,
    paddingLeft: 6,
    paddingRight: space2,
    borderRadius: tokens.radius.radiusSm,
    borderWidth: 1,
  },
  avatars: { flexDirection: "row" },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, overflow: "hidden", borderWidth: 2 },
  overlap: { marginLeft: -8 },
  text: { flex: 1, minWidth: 0 },
  strong: { fontWeight: "800" },
});
