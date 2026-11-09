// Onglet « Spots » du crew (lot R7b2, maquette R7.11 `ct_spo`) : les rendez-vous au spot lancés pour le crew.
// FICHIER RÉSERVÉ au lot R7i, qui le remplace (liste des rendez-vous du crew et « Lancer un rendez-vous pour le crew »).
// Ici, seulement l'état vide : « Pas de rendez-vous », le bouton grisé et la ligne qui dit pourquoi.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { crewTabLabels as L } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { SmButton } from "@/ui/Kit";
import { Muted } from "@/ui/Muted";

const { space2, space3 } = tokens.spacing;

export function CrewSpots(_props: { crewId: string; archived?: boolean }) {
  const { t } = useTheme();
  return (
    <View style={styles.col} testID="crew-spots">
      <View style={[styles.empty, { backgroundColor: t.color.surface, boxShadow: t.shadow.shadowCard }]}>
        <Icon name="place" size={28} color={t.color.inkMuted} />
        <Text variant="posterS" color={t.color.ink} style={styles.center}>
          {L.spotsEmptyTitle}
        </Text>
        <Muted variant="caption" style={styles.center}>
          {L.spotsEmptyHint}
        </Muted>
      </View>
      <SmButton kind="s" big wide icon="place" disabled testID="crew-spots-launch">
        {L.spotsLaunch}
      </SmButton>
      <Muted variant="caption" testID="crew-spots-soon">
        {L.spotsSoon}
      </Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  col: { gap: space3 },
  empty: {
    alignItems: "center",
    gap: space2,
    padding: space3 + 4,
    borderRadius: tokens.radius.radiusLg,
  },
  center: { textAlign: "center" },
});
