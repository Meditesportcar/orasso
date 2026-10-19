// Fiche v2, fermée (lot 44, `s-event` ; raison du lot 36) : on dit pourquoi et quoi faire. Complet : la liste d'attente
// reste ouverte (la candidature y passe) ; clos : la raison (liste d'accès figée) ; pas encore ouvert : la date, et
// l'avant-première pour les abonnés de la structure (« Suivre »).
import { Button, Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type EventPublic, eventPageLabels as L, type RegistrationBlock, registrationBlockText } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { nowMs } from "@/lib/clock";
import { formatDayHourYear } from "@/lib/format";
import type { EventGate } from "./action";

const { space1, space3 } = tokens.spacing;

export function EventGatePlate({
  gate,
  event,
  block,
  following,
  busy,
  onWaitlist,
  onFollow,
}: {
  gate: Exclude<EventGate, null>;
  event: EventPublic;
  block: RegistrationBlock | null;
  following: boolean;
  busy: boolean;
  onWaitlist: () => void;
  onFollow: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const when = (iso: string) => formatDayHourYear(iso, new Date(nowMs()));
  const opensAt = block && "opensAt" in block ? block.opensAt : event.registrationsOpenAt;
  const title =
    gate === "soon"
      ? L.soonTitle(when(event.registrationOpensAtForMe ?? opensAt))
      : gate === "ended"
        ? L.endedTitle
        : L.closedTitle;
  const text =
    gate === "full"
      ? L.closedFull(event.capacity)
      : gate === "soon" && event.previewHours > 0 && block?.code === "not_open"
        ? L.soonPreview(event.structure.name, when(event.registrationsOpenAt))
        : block
          ? registrationBlockText(block, when)
          : "";
  return (
    <View
      style={[styles.box, { backgroundColor: c.surfaceRaised, borderColor: c.line }]}
      testID={gate === "soon" ? "event-soon" : gate === "ended" ? "event-ended" : "event-closed"}
    >
      <View style={[styles.icon, { backgroundColor: c.ink }]}>
        <Icon name={gate === "soon" ? "wait" : gate === "ended" ? "flag" : "close"} size={20} color={c.ground} />
      </View>
      <View style={styles.body}>
        <Text variant="bodyStrong" color={c.ink}>
          {title}
        </Text>
        <Text variant="meta" color={c.inkMuted} testID="registration-reason">
          {text}
        </Text>
        {gate === "full" ? (
          <Button variant="secondary" icon="wait" onPress={onWaitlist} testID="join-waitlist">
            {L.joinWaitlist}
          </Button>
        ) : null}
        {gate === "soon" ? (
          following ? (
            <Text variant="meta" color={c.inkMuted}>
              {L.soonFollowing}
            </Text>
          ) : (
            <Button variant="secondary" icon="add" loading={busy} onPress={onFollow} testID="soon-follow">
              {L.soonFollow(event.structure.name)}
            </Button>
          )
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", gap: space3, padding: space3, borderRadius: tokens.radius.radiusMd, borderWidth: 1.5 },
  icon: { width: 40, height: 40, borderRadius: tokens.radius.radiusMd, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, gap: space1, alignItems: "flex-start" },
});
