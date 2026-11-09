// « Pourquoi je vois ça » (maquette R7.6) : la raison de la carte en clair, puis ce que le Fil regarde pour classer, et
// rien d'autre. Le texte d'une carte « Sponsorisé » est fixe (lot R7k2) : département seulement, ou toute la France ; la
// ligne sur le classement du Fil ne s'y applique pas.
import { Button, Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type FeedCard, feedWhyText, isFeedSponsoredTargeted, feedScreenLabels as L } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

import { AppSheet } from "@/ui/AppSheet";

/** Le pseudo qui complète la raison « Tu suis … » (publication ou voiture d'une personne). */
function whoOf(card: FeedCard): string | null {
  if (card.kind === "feed_post") return card.payload.post.author.pseudo;
  if (card.kind === "vehicle_public") return card.payload.owner.pseudo;
  return null;
}

export function WhyThisSheet({ card, onClose }: { card: FeedCard | null; onClose: () => void }) {
  const { t } = useTheme();
  return (
    <AppSheet visible={Boolean(card)} onClose={onClose} accessibilityLabel={L.whyTitle}>
      {card ? (
        <>
          <View style={styles.head}>
            <Text variant="posterM" color={t.color.ink} style={styles.title} accessibilityRole="header">
              {L.whyTitle}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              hitSlop={6}
              style={[styles.closex, { backgroundColor: t.color.surface }]}
              testID="feed-why-close"
            >
              <Icon name="close" size={20} color={t.color.ink} />
            </Pressable>
          </View>
          <Text variant="bodyStrong" color={t.color.ink} style={styles.why} testID="feed-why-text">
            {feedWhyText(
              card.reason.code,
              whoOf(card),
              card.kind === "feed_post" && card.payload.post.mine,
              isFeedSponsoredTargeted(card.reason.label),
            )}
          </Text>
          {card.kind === "sponsored" ? null : (
            <View style={styles.note}>
              <Icon name="info" size={16} color={t.color.accentText} />
              <Text variant="caption" color={t.color.inkMuted} style={styles.noteText}>
                {L.whyNote}
              </Text>
            </View>
          )}
          <Button variant="secondary" icon="check" fullWidth onPress={onClose} testID="feed-why-ok">
            {L.whyClose}
          </Button>
        </>
      ) : null}
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "flex-start", gap: tokens.spacing.space2 },
  title: { flex: 1, fontSize: 20, lineHeight: 22 },
  closex: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  why: { fontSize: 15, lineHeight: 22 },
  note: { flexDirection: "row", alignItems: "flex-start", gap: tokens.spacing.space2 },
  noteText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
});
