// Invitations nominatives reçues (lot 25) : cartes de l'onglet Accès (docs/02 « invitations nominatives reçues ») et de
// Boîte > Demandes. « Répondre » ouvre la feuille (véhicule, règlement, accepter ou refuser).
import { Button, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { invitationLabels, type ReceivedInvitation } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { formatDayHour } from "@/lib/format";
import { Avatar } from "@/ui/Avatar";

const L = invitationLabels;
const { space2, space3 } = tokens.spacing;

export function InvitationCard({
  inv,
  onAnswer,
  onOpenEvent,
}: {
  inv: ReceivedInvitation;
  onAnswer: () => void;
  onOpenEvent: () => void;
}) {
  const { t } = useTheme();
  return (
    <Plate style={styles.card} testID="received-invitation">
      <View style={styles.head}>
        <Avatar url={inv.event.structure.logoUrl} pseudo={inv.event.structure.name} size={40} />
        <View style={styles.text}>
          <Text variant="label" color={t.color.plateMuted}>
            {L.invitedBy(inv.event.structure.name)}
            {inv.event.privateEvent ? ` · ${L.privateBadge}` : ""}
          </Text>
          <Text variant="bodyStrong" color={t.color.plateInk}>
            {inv.event.title}
          </Text>
          <Text variant="caption" color={t.color.plateMuted}>
            {formatDayHour(inv.event.startsAt)}
            {inv.event.city ? ` · ${inv.event.city}` : ""}
          </Text>
        </View>
      </View>
      {inv.vehicle ? (
        <Text variant="body" color={t.color.plateInk}>
          {L.invitedVehicle(inv.vehicle.label)}
        </Text>
      ) : null}
      {inv.message ? (
        <Text variant="body" color={t.color.plateMuted}>
          {inv.message}
        </Text>
      ) : null}
      <Text variant="caption" color={t.color.plateMuted}>
        {L.validUntil(formatDayHour(inv.event.lockAt))}
      </Text>
      <View style={styles.row}>
        <Button variant="plate" icon="entry" onPress={onAnswer} testID="invitation-answer">
          {L.answer}
        </Button>
        <Button variant="plate" icon="explore" onPress={onOpenEvent}>
          {L.openEvent}
        </Button>
      </View>
    </Plate>
  );
}

const styles = StyleSheet.create({
  card: { gap: space3, padding: space3 },
  head: { flexDirection: "row", alignItems: "center", gap: space3 },
  text: { flex: 1, gap: 2 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
});
