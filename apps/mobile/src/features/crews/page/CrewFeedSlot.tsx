// Lot R5c2 : emplacement de l'onglet Fil de la page du crew. Le fil (publications, photos, réactions, commentaires,
// sondages) est fait par le lot R5c1 (`features/crews/feed/`) : à la fusion, le coordinateur remplace ce composant par
// son `CrewFeed` (mêmes propriétés : le crew, et si la personne en est le chef).
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { crewPageLabels as L } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

export function CrewFeedSlot(_props: { crewId: string; leader: boolean }) {
  const { t } = useTheme();
  return (
    <View
      style={[styles.slot, { backgroundColor: t.color.surface, borderColor: t.color.line }]}
      testID="crew-feed-slot"
    >
      <Text variant="body" color={t.color.inkMuted}>
        {L.feedSlot}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    padding: tokens.spacing.space4,
    borderRadius: tokens.radius.radiusLg,
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
  },
});
