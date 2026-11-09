// Carte neutre pour un genre que cet écran ne dessine pas encore (`spot_meetup` : lot R7i ; `memory` : lot R7j ;
// `sponsored` : lot R7k2) ou inconnu : la raison, rien d'autre. Aucun contenu n'est deviné.
import { Icon, Text, useTheme } from "@orasso/design-system/native";
import { feedCardKindLabels, feedScreenLabels as L } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { CardShell } from "./CardShell";
import { reasonLine } from "./parts";
import type { CardProps } from "./types";

export function UnknownCard({ card, onMenu, faded }: CardProps) {
  const { t } = useTheme();
  const label = feedCardKindLabels[card.kind] ?? "Le Fil";
  return (
    <CardShell
      card={card}
      head={
        <View style={[styles.round, { backgroundColor: t.color.surfaceRaised }]}>
          <Icon name="feed" size={20} color={t.color.inkMuted} />
        </View>
      }
      title={label}
      reason={reasonLine(card)}
      onMenu={onMenu}
      faded={faded}
      testID={`feed-card-${card.kind}`}
    >
      <Text variant="caption" color={t.color.inkMuted}>
        {L.unknownCard}
      </Text>
    </CardShell>
  );
}

const styles = StyleSheet.create({
  round: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
});
