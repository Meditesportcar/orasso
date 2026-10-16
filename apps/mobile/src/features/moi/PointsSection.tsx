// Moi, points et grade de la saison (lot 09, déplacé ici au lot 16).
import { Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { gradeLabels, type PointKind, pointKindLabels } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { formatShortDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { plateText } from "@/ui/plateText";
import { SectionTitle } from "@/ui/Screens";

const { space2, space3 } = tokens.spacing;

export function PointsSection() {
  const { t } = useTheme();
  const { me } = useSession();
  const points = useApi(() => api.points(), [], { cacheKey: "points" });
  const profile = me?.profile;
  const p = points.data;
  return (
    <>
      <SectionTitle>Points et grade</SectionTitle>
      <Plate style={styles.block}>
        <Text variant="posterM" color={t.color.plateInk}>
          {profile ? `${gradeLabels[profile.grade]} · ${profile.pointsSeason} pts` : ""}
        </Text>
        <Text variant="body" color={t.color.plateMuted}>
          {p?.next
            ? `Encore ${Math.max(0, p.next.threshold - p.pointsSeason)} points pour passer ${gradeLabels[p.next.grade]}. `
            : "Grade maximal de la saison. "}
          {p ? `${p.season.name}.` : ""}
        </Text>
        {p?.entries.slice(0, 6).map((entry) => (
          <View key={entry.id} style={styles.entry}>
            <Text variant="meta" color={t.color.plateMuted} style={styles.entryDate}>
              {formatShortDate(entry.at)}
            </Text>
            <Text variant="body" color={t.color.plateInk} style={styles.entryLabel}>
              {entry.event?.title ?? pointKindLabels[entry.kind as PointKind] ?? entry.kind}
              {entry.event ? ` · ${pointKindLabels[entry.kind as PointKind] ?? entry.kind}` : ""}
            </Text>
            <Text variant="bodyStrong" color={entry.points < 0 ? plateText.alert : t.color.plateInk}>
              {entry.points > 0 ? `+${entry.points}` : `${entry.points}`.replace("-", "−")}
            </Text>
          </View>
        ))}
        {p && p.pending.length > 0 ? (
          <Text variant="body" color={plateText.accent}>
            Pointage en attente : {p.pending.map((x) => x.title).join(", ")}.
          </Text>
        ) : null}
      </Plate>
    </>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  entry: { flexDirection: "row", alignItems: "baseline", gap: space3 },
  entryDate: { width: 52 },
  entryLabel: { flex: 1 },
});
