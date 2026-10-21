// Direct hors événement (DA v2, lot 52, prototype `s-odirect`) : l'équivalent de l'Accueil pour l'organisateur. Le
// prochain événement : retenus sur la capacité, J-N, ce qui reste à trier (avec « Trier »), les retenus par zone, et
// l'équipe (présences confirmées, prochaine relance). Lot C4a : mise en page de l'artefact (`.dir-big` crème, `.bars`). Tout vient de l'API ; rien ne se calcule ici que des totaux.
import { Button, Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type EventOrganizer, type EventStaffMember, orgaV2Labels as L, type LiveCounters } from "@orasso/shared";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { dayCountdown, formatDay } from "@/lib/format";
import { nextReminder, reminderText } from "@/lib/orgaV2";
import { Muted } from "@/ui/Muted";

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
      {/* `.dir-big` : retenus sur carte crème, à trier sur carte, côte à côte. */}
      <View style={styles.big}>
        <View style={[styles.bigCard, { backgroundColor: c.poster }]} testID="orga-direct-retained">
          <Text variant="label" color={c.posterMuted}>
            {L.directRetained}
          </Text>
          <Text variant="numberNarrow" color={c.posterInk} style={styles.num}>
            {accepted}
            {capacity !== null ? (
              <Text variant="numberNarrow" color={c.posterInk} style={styles.numSmall}>
                {`/${capacity}`}
              </Text>
            ) : null}
          </Text>
          <Text variant="caption" color={c.posterMuted}>
            {dayCountdown(event.startsAt, at)}
          </Text>
        </View>
        <View style={[styles.bigCard, { backgroundColor: c.surface }]}>
          <Text variant="label" color={c.inkMuted}>
            {L.directToSort}
          </Text>
          <Text variant="numberNarrow" color={c.ink} style={styles.num} testID="orga-direct-pending">
            {event.counters.pending}
          </Text>
          <Button
            variant="primary"
            icon="check"
            onPress={() => router.push({ pathname: "/tri", params: { event: event.id } })}
            testID="orga-direct-sort"
          >
            {L.directSort}
          </Button>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: c.surface }]} testID="orga-direct-zones">
        <Text variant="label" color={c.inkMuted}>
          {L.directByZone}
        </Text>
        {event.zones.length === 0 ? <Muted variant="body">{L.directNoZones}</Muted> : null}
        {event.zones.map((z) => {
          const n = zoneCount(z.id);
          const ratio = z.capacity ? Math.min(1, n / z.capacity) : 0;
          return (
            <View key={z.id} style={styles.bar}>
              <Text variant="bodyStrong" color={c.ink} style={styles.barName} numberOfLines={1}>
                {z.name}
              </Text>
              <View style={[styles.track, { backgroundColor: c.line }]}>
                <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: c.ink }]} />
              </View>
              <Text variant="bodyStrong" color={c.ink} style={styles.barCount}>
                {n}
                {z.capacity ? `/${z.capacity}` : ""}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={[styles.card, styles.row, { backgroundColor: c.surface }]} testID="orga-direct-team">
        <Icon name="staff" size={26} color={c.ink} />
        <View style={styles.grow}>
          <Text variant="bodyStrong" color={c.ink}>
            {staff.length === 0 ? L.directTeamNone : L.directTeam(present, staff.length)}
          </Text>
          <Muted variant="caption">
            {next && unanswered ? L.directRemind(reminderText(next, at)) : L.directRemindNone}
          </Muted>
        </View>
        <Button variant="secondary" icon="next" onPress={() => router.push("/equipe")} testID="orga-direct-team-see">
          {L.directSeeTeam}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space2 + 2 },
  big: { flexDirection: "row", gap: 10 },
  bigCard: { flex: 1, minWidth: 0, borderRadius: 20, padding: 14, gap: space1, boxShadow: "0 8px 24px rgba(0,0,0,0.40)" },
  num: { fontSize: 64, lineHeight: 62 },
  numSmall: { fontSize: 24, lineHeight: 28 },
  card: { borderRadius: 18, padding: 14, gap: space2, boxShadow: "0 8px 24px rgba(0,0,0,0.40)" },
  row: { flexDirection: "row", alignItems: "center", gap: space3 },
  grow: { flex: 1, gap: space1 },
  bar: { flexDirection: "row", alignItems: "center", gap: space2 },
  barName: { width: 90, fontSize: 13 },
  track: { flex: 1, height: 12, borderRadius: 6, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 6 },
  barCount: { width: 54, textAlign: "right", fontSize: 13, fontVariant: ["tabular-nums"] },
});
