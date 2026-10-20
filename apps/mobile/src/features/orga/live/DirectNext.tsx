// Direct hors événement (DA v2, lot 52, prototype `s-odirect`) : l'équivalent de l'Accueil pour l'organisateur. Le
// prochain événement : retenus sur la capacité, J-N, ce qui reste à trier (avec « Trier »), les retenus par zone, et
// l'équipe (présences confirmées, prochaine relance). Tout vient de l'API ; rien ne se calcule ici que des totaux.
import { Button, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type EventOrganizer, type EventStaffMember, orgaV2Labels as L, type LiveCounters } from "@orasso/shared";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { dayCountdown, formatDay } from "@/lib/format";
import { nextReminder, reminderText } from "@/lib/orgaV2";
import { Muted } from "@/ui/Muted";
import { SectionTitle } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;

export function DirectNext({
  event,
  live,
  staff,
  at,
}: {
  event: EventOrganizer;
  live: LiveCounters | null;
  staff: readonly EventStaffMember[];
  at: Date;
}) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const accepted = event.counters.accepted;
  const capacity = event.capacity;
  const present = staff.filter((m) => m.presence === "present").length;
  const next = nextReminder(at, event.startsAt);
  const unanswered = staff.some((m) => m.presence === "unknown");
  const zoneCount = (zoneId: string) => live?.byZone.find((z) => z.zoneId === zoneId)?.expected ?? 0;

  return (
    <View style={styles.wrap} testID="orga-direct-next">
      <Muted variant="label">{L.directNext(formatDay(event.startsAt))}</Muted>
      <Plate style={styles.block} testID="orga-direct-retained">
        <View style={styles.line}>
          <View style={styles.grow}>
            <Text variant="label" color={c.plateMuted}>
              {L.directRetained}
            </Text>
            <Text variant="posterXl" color={c.plateInk}>
              {accepted}
              {capacity !== null ? (
                <Text variant="posterM" color={c.plateMuted}>
                  {` /${capacity}`}
                </Text>
              ) : null}
            </Text>
          </View>
          <Text variant="posterM" color={c.plateInk}>
            {dayCountdown(event.startsAt, at)}
          </Text>
        </View>
        <View style={styles.line}>
          <View style={styles.grow}>
            <Text variant="label" color={c.plateMuted}>
              {L.directToSort}
            </Text>
            <Text variant="number" color={c.plateInk} testID="orga-direct-pending">
              {event.counters.pending}
            </Text>
          </View>
          <Button
            variant="primary"
            icon="check"
            next
            onPress={() => router.push({ pathname: "/tri", params: { event: event.id } })}
            testID="orga-direct-sort"
          >
            {L.directSort}
          </Button>
        </View>
      </Plate>

      <SectionTitle>{L.directByZone}</SectionTitle>
      {event.zones.length === 0 ? (
        <Muted variant="body">{L.directNoZones}</Muted>
      ) : (
        <Plate style={styles.block} testID="orga-direct-zones">
          {event.zones.map((z) => (
            <View key={z.id} style={styles.zone}>
              <Text variant="bodyStrong" color={c.plateInk} style={styles.grow}>
                {z.name}
              </Text>
              <Text variant="bodyStrong" color={c.plateInk}>
                {zoneCount(z.id)}
                {z.capacity ? `/${z.capacity}` : ""}
              </Text>
            </View>
          ))}
        </Plate>
      )}

      <Plate style={styles.block} testID="orga-direct-team">
        <Text variant="bodyStrong" color={c.plateInk}>
          {staff.length === 0 ? L.directTeamNone : L.directTeam(present, staff.length)}
        </Text>
        <Text variant="caption" color={c.plateMuted}>
          {next && unanswered ? L.directRemind(reminderText(next, at)) : L.directRemindNone}
        </Text>
        <Button
          variant="plate"
          icon="staff"
          next
          onPress={() => router.push("/equipe")}
          fullWidth
          testID="orga-direct-team-see"
        >
          {L.directSeeTeam}
        </Button>
      </Plate>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space2 },
  block: { gap: space3, padding: space3 },
  line: { flexDirection: "row", alignItems: "center", gap: space2 },
  grow: { flex: 1, gap: space1 },
  zone: { flexDirection: "row", alignItems: "baseline", gap: space2 },
});
