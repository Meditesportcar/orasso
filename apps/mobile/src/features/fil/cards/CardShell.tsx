// La coque d'une carte du Fil (maquette R7.6 `.r7c`) : l'en-tête (rond ou logo, titre, la raison en petite ligne, « ⋯ »),
// le contenu, une ligne d'actions. Chaque genre de carte (un fichier par `kind`) ne dessine que son contenu. Un nom
// (véhicule, événement, personne) ne se tronque jamais.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type FeedCard, feedScreenLabels as L } from "@orasso/shared";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

const { space1, space2, space3 } = tokens.spacing;

export function CardShell({
  card,
  head,
  title,
  reason,
  onMenu,
  onTitle,
  faded = false,
  children,
  actions,
  testID,
}: {
  card: FeedCard;
  /** Le rond de l'en-tête : avatar, logo, trophée. */
  head: ReactNode;
  title: string;
  /** La petite ligne sous le titre : la raison (« Autour de toi »), éventuellement suivie d'un repère. */
  reason: string;
  onMenu: (card: FeedCard) => void;
  /** Toucher le titre (le pseudo → son profil). */
  onTitle?: () => void;
  /** « Moins de ce genre » pris : la carte s'estompe. */
  faded?: boolean;
  children?: ReactNode;
  actions?: ReactNode;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View
      style={[styles.card, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }, faded && styles.faded]}
      testID={testID ?? `feed-card-${card.kind}`}
      accessibilityLabel={title}
    >
      <View style={styles.head}>
        {head}
        <View style={styles.grow}>
          {onTitle ? (
            <Pressable accessibilityRole="link" accessibilityLabel={title} onPress={onTitle} hitSlop={4}>
              <Text variant="bodyStrong" color={c.ink} style={styles.title}>
                {title}
              </Text>
            </Pressable>
          ) : (
            <Text variant="bodyStrong" color={c.ink} style={styles.title}>
              {title}
            </Text>
          )}
          <Text variant="caption" color={c.inkMuted} testID="feed-card-reason">
            {reason}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={L.moreFor(title)}
          onPress={() => onMenu(card)}
          hitSlop={6}
          style={styles.dots}
          testID="feed-card-more"
        >
          <Icon name="more" size={20} color={c.inkMuted} />
        </Pressable>
      </View>
      {children ? <View style={styles.body}>{children}</View> : null}
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space2 + 2, padding: space3, borderRadius: tokens.radius.radiusLg },
  faded: { opacity: 0.45 },
  head: { flexDirection: "row", alignItems: "center", gap: space2 + 2 },
  grow: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, lineHeight: 18 },
  dots: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  body: { gap: space2 },
  actions: { flexDirection: "row", alignItems: "center", gap: space2, flexWrap: "wrap", marginTop: space1 - 2 },
});
