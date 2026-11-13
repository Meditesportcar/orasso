// La coque d'une carte du Fil (maquette R7.6 `.r7c`) : l'en-tête (rond ou logo, titre, la raison en petite ligne, « ⋯ »),
// le contenu, une ligne d'actions. Chaque genre de carte (un fichier par `kind`) ne dessine que son contenu. Un nom
// (véhicule, événement, personne) ne se tronque jamais.
import { Icon, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type FeedCard, feedScreenLabels as L } from "@orasso/shared";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

const { space1, space2, space3 } = tokens.spacing;

export function CardShell({
  card,
  head,
  title,
  reason,
  tag,
  onMenu,
  onTitle,
  titleNode,
  faded = false,
  banner,
  headTag,
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
  /** Une étiquette en contour à la place de la ligne de raison (carte « Sponsorisé » : toujours visible, jamais un texte gris). */
  tag?: string;
  onMenu: (card: FeedCard) => void;
  /** Toucher le titre (le pseudo → son profil). */
  onTitle?: () => void;
  /** Le titre composé par la carte (R8o : la signature à deux noms, chacun ouvre sa page) ; `title` reste le nom accessible. */
  titleNode?: ReactNode;
  /** « Moins de ce genre » pris : la carte s'estompe. */
  faded?: boolean;
  /** Bandeau en tête de la carte, avant l'en-tête (« Collaboration commerciale », lot R7m2). */
  banner?: ReactNode;
  /** Une étiquette à droite du nom, dans l'en-tête (R9c : « Offre »). Absente : l'en-tête ne change pas. */
  headTag?: ReactNode;
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
      {banner}
      <View style={styles.head}>
        {head}
        <View style={styles.grow}>
          {titleNode ? (
            titleNode
          ) : onTitle ? (
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
          {tag ? (
            <View style={styles.tagRow} testID="feed-card-reason">
              <Tag tone="line" testID="feed-sponsored-tag">
                {tag}
              </Tag>
            </View>
          ) : (
            <Text variant="caption" color={c.inkMuted} testID="feed-card-reason">
              {reason}
            </Text>
          )}
        </View>
        {headTag}
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
  tagRow: { flexDirection: "row", marginTop: 2 },
  dots: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  body: { gap: space2 },
  actions: { flexDirection: "row", alignItems: "center", gap: space2, flexWrap: "wrap", marginTop: space1 - 2 },
});
