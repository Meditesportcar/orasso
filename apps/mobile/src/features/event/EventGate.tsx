// Fiche v2, fermée (lot 44, `s-event` ; raison du lot 36) : on dit pourquoi et quoi faire. Complet : la liste d'attente
// reste ouverte (la candidature y passe) ; clos : la raison (liste d'accès figée) ; pas encore ouvert : la date, et
// l'avant-première pour les abonnés de la structure (« Suivre »).
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type EventPublic, eventPageLabels as L, type RegistrationBlock, registrationBlockText } from "@orasso/shared";
import { StyleSheet, View } from "react-native";
import { SmButton } from "@/features/passionne/kit";
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
        <Text variant="bodyStrong" color={c.ink} style={styles.title}>
          {title}
        </Text>
        <Text variant="caption" color={c.inkMuted} testID="registration-reason">
          {text}
        </Text>
        {gate === "full" ? (
          <SmButton kind="s" icon="wait" onPress={onWaitlist} style={styles.btn} testID="join-waitlist">
            {L.joinWaitlist}
          </SmButton>
        ) : null}
        {gate === "soon" ? (
          following ? (
            <Text variant="caption" color={c.inkMuted}>
              {L.soonFollowing}
            </Text>
          ) : (
            <SmButton kind="s" icon="bell" disabled={busy} onPress={onFollow} style={styles.btn} testID="soon-follow">
              {L.soonFollow(event.structure.name)}
            </SmButton>
          )
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", gap: space3, padding: space3 + 2, borderRadius: 16, borderWidth: 1.5 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, gap: 3, alignItems: "flex-start" },
  title: { fontFamily: "Archivo-ExtraBold" },
  btn: { marginTop: space1 + 6 },
});
