// Une carte qui est déjà une surface (la carte d'événement de l'Explorer) : posée telle quelle, avec sous elle la raison
// du Fil en petite ligne et « ⋯ » (même menu que les autres cartes).
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type FeedCard, feedScreenLabels as L } from "@orasso/shared";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { reasonLine } from "./parts";

export function CardRow({
  card,
  title,
  onMenu,
  faded,
  children,
  testID,
}: {
  card: FeedCard;
  title: string;
  onMenu: (card: FeedCard) => void;
  faded: boolean;
  children: ReactNode;
  testID?: string;
}) {
  const { t } = useTheme();
  return (
    <View style={[styles.wrap, faded && styles.faded]} testID={testID ?? `feed-card-${card.kind}`}>
      {children}
      <View style={styles.foot}>
        <Text variant="caption" color={t.color.inkMuted} style={styles.reason} testID="feed-card-reason">
          {reasonLine(card)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={L.moreFor(title)}
          onPress={() => onMenu(card)}
          hitSlop={6}
          style={styles.dots}
          testID="feed-card-more"
        >
          <Icon name="more" size={20} color={t.color.inkMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: tokens.spacing.space1 },
  faded: { opacity: 0.45 },
  foot: { flexDirection: "row", alignItems: "center", gap: tokens.spacing.space2, paddingLeft: tokens.spacing.space1 },
  reason: { flex: 1 },
  dots: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
