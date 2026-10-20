// Casquette Pro, Stats (DA v2, lot 54, prototype `s-pstats`) : deux chiffres en grand (vues de la fiche, remises), le
// détail par grade en barres, sur les 30 derniers jours. Les clics « appeler » et « itinéraire » et les abonnés restent
// en petit dessous (existant lot 14). Tes propres visites ne sont pas comptées.
import { Counters, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { proV2Labels } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { formatCount, gradeBars } from "@/lib/proPresta";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;

export default function ProStats() {
  const { t } = useTheme();
  const myPro = useApi(() => api.myPro(), [], { cacheKey: "my-pro" });
  const proId = myPro.data?.id;
  const stats = useApi(() => api.proStats(proId ?? ""), [proId], { enabled: Boolean(proId), cacheKey: "pro-stats" });
  const s = stats.data;
  return (
    <TabScreen
      title={proV2Labels.statsTitle}
      facts={proV2Labels.statsPeriod}
      onRefresh={async () => {
        await Promise.all([myPro.reload(), stats.reload()]);
      }}
    >
      {!myPro.data ? (
        myPro.loading ? null : (
          <Notice>Tu n'as pas encore de fiche pro. Crée-la sur le site Orasso.</Notice>
        )
      ) : !s ? null : (
        <>
          <View style={styles.big} testID="pro-stats-big">
            <Plate style={styles.bigCell}>
              <Text variant="label" color={t.color.plateMuted}>
                {proV2Labels.views}
              </Text>
              <Text variant="numberNarrow" color={t.color.plateInk} style={styles.bigNumber} testID="pro-stats-views">
                {formatCount(s.views)}
              </Text>
            </Plate>
            <Plate style={styles.bigCell}>
              <Text variant="label" color={t.color.plateMuted}>
                {proV2Labels.discounts}
              </Text>
              <Text
                variant="numberNarrow"
                color={t.color.plateInk}
                style={styles.bigNumber}
                testID="pro-stats-discounts"
              >
                {formatCount(s.discounts)}
              </Text>
            </Plate>
          </View>

          <Plate style={styles.block} testID="pro-stats-grades">
            <Text variant="label" color={t.color.plateMuted}>
              {proV2Labels.byGrade}
            </Text>
            {gradeBars(s.discountsByGrade).map((bar) => (
              <View key={bar.grade} style={styles.barRow}>
                <Text variant="body" color={t.color.plateInk} style={styles.barLabel}>
                  {bar.label}
                </Text>
                <View style={[styles.track, { backgroundColor: t.color.plateLine }]}>
                  <View style={[styles.fill, { width: `${bar.percent}%`, backgroundColor: t.color.accent }]} />
                </View>
                <Text variant="bodyStrong" color={t.color.plateInk} style={styles.barCount}>
                  {bar.count}
                </Text>
              </View>
            ))}
          </Plate>

          <Counters
            items={[
              { value: s.calls, label: "appels" },
              { value: s.routes, label: "itinéraires" },
              { value: s.followers, label: "abonnés" },
            ]}
          />
          <Muted variant="caption">Tes propres visites de ta fiche ne sont pas comptées.</Muted>
        </>
      )}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  big: { flexDirection: "row", gap: space2 },
  bigCell: { flex: 1, minWidth: 0, gap: space1, padding: space3 },
  bigNumber: { fontSize: 44, lineHeight: 48 },
  block: { gap: space2, padding: space3 },
  barRow: { flexDirection: "row", alignItems: "center", gap: space2 },
  barLabel: { width: 76 },
  track: { flex: 1, height: 10, borderRadius: 5, overflow: "hidden" },
  fill: { height: 10, borderRadius: 5 },
  barCount: { width: 32, textAlign: "right" },
});
