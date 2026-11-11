// Les deux étiquettes d'une publication du journal d'un événement : « Épinglée » et « Inscrits prévenus » (maquette R8.5
// `pinB` et `notifB`, `.r8pin`). Posées par la fiche de l'événement (lot R8d) sur les vignettes et les cartes de la brique de
// liste ; la liste d'un profil n'en pose jamais.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type FeedPostView, journalBadges, eventJournalLabels as L } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

/** Ce que la fiche donne à la liste : le menu « … » de l'organisateur (absent pour un passionné) et les étiquettes. */
export type JournalOptions = { onMenu?: (post: FeedPostView) => void };

const { space1 } = tokens.spacing;

export function JournalBadges({ post, floating = false }: { post: FeedPostView; floating?: boolean }) {
  const { t } = useTheme();
  const c = t.color;
  const badges = journalBadges(post);
  if (!badges.pinned && !badges.notified) return null;
  const chip = (icon: "star" | "bell", label: string, accent: boolean, testID: string) => (
    <View key={testID} style={[styles.chip, { backgroundColor: accent ? c.accent : c.surface }]} testID={testID}>
      <Icon name={icon} size={12} color={accent ? c.accentInk : c.ink} />
      <Text variant="caption" color={accent ? c.accentInk : c.ink} style={styles.label}>
        {label}
      </Text>
    </View>
  );
  return (
    <View style={[styles.row, floating ? styles.rowFloating : null]} pointerEvents="none">
      {badges.pinned ? chip("star", L.pinned, true, "journal-pinned") : null}
      {badges.notified ? chip("bell", L.notified, false, "journal-notified") : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: space1 },
  rowFloating: { position: "absolute", top: space1 + 2, left: space1 + 2, right: space1 + 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minHeight: 20,
    borderRadius: tokens.radius.radiusSm,
    alignSelf: "flex-start",
  },
  label: { fontSize: 11, lineHeight: 14 },
});
