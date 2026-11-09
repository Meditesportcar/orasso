// Le menu « ⋯ » d'une carte du Fil (maquette R7.6 `mn_why_mk_ad`) : une feuille de trois lignes. « Pourquoi je vois ça »
// (la raison, en clair), « Moins de ce genre » (`POST /me/feed/less` ; la carte s'estompe avec un « Annuler »), « Signaler »
// (la feuille de signalement de l'appli, cible `feed_post` pour une publication). Une carte qui n'est pas signalable
// (pas de publication d'une personne : événement, voiture…) n'a pas « Signaler » ; ma propre publication a « Supprimer ».
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type FeedCard, feedCardKindLabels, feedScreenLabels as L } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

import { SetRow } from "@/features/profil/parts";
import { AppSheet } from "@/ui/AppSheet";

/** La carte est-elle une publication du Fil ? Seule cible de signalement du Fil (R7e1). */
export const isPostCard = (card: FeedCard): card is FeedCard<"feed_post"> => card.kind === "feed_post";

export function CardMenu({
  card,
  onClose,
  onWhy,
  onLess,
  onReport,
  onRemove,
}: {
  card: FeedCard | null;
  onClose: () => void;
  onWhy: (card: FeedCard) => void;
  onLess: (card: FeedCard) => void;
  onReport: (card: FeedCard) => void;
  onRemove: (card: FeedCard) => void;
}) {
  const { t } = useTheme();
  const mine = card && isPostCard(card) && card.payload.post.mine;
  const title = card ? feedCardKindLabels[card.kind] : "";
  return (
    <AppSheet visible={Boolean(card)} onClose={onClose} accessibilityLabel={L.more}>
      {card ? (
        <>
          <View style={styles.head}>
            <Text variant="posterM" color={t.color.ink} style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              hitSlop={6}
              style={[styles.closex, { backgroundColor: t.color.surface }]}
              testID="feed-menu-close"
            >
              <Icon name="close" size={20} color={t.color.ink} />
            </Pressable>
          </View>
          <View style={[styles.list, { backgroundColor: t.color.surface, boxShadow: t.shadow.shadowCard }]}>
            <SetRow
              first
              icon="help"
              title={L.whyTitle}
              caption={L.menuWhyHint}
              onPress={() => onWhy(card)}
              testID="feed-menu-why"
            />
            {mine ? (
              <SetRow
                icon="trash"
                title={L.removePost}
                onPress={() => onRemove(card)}
                tone="out"
                testID="feed-menu-remove"
              />
            ) : (
              <>
                <SetRow
                  icon="eyeOff"
                  title={L.lessFaded}
                  caption={L.menuLessHint}
                  onPress={() => onLess(card)}
                  testID="feed-menu-less"
                />
                {isPostCard(card) ? (
                  <SetRow
                    icon="flag"
                    title={L.report}
                    caption={L.reportHint}
                    onPress={() => onReport(card)}
                    tone="out"
                    testID="feed-menu-report"
                  />
                ) : null}
              </>
            )}
          </View>
        </>
      ) : null}
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "flex-start", gap: tokens.spacing.space2 },
  title: { flex: 1, fontSize: 20, lineHeight: 22 },
  closex: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  list: { borderRadius: tokens.radius.radiusLg, overflow: "hidden" },
});
