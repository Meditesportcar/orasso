// Casquette Pro, Stats (DA v2, lot 54, prototype `s-pstats`) : deux chiffres en grand (vues de la fiche, remises), le
// détail par grade en barres, sur les 30 derniers jours. Les clics « appeler » et « itinéraire » et les abonnés restent
// en petit dessous (existant lot 14). Tes propres visites ne sont pas comptées.
// Lot C4b (artefact `s-pstats`) : tuiles `.dir-big` (la première crème) et barres `.bars` (piste 12 px, remplissage encre).
import { Counters, Text, tokens, useTheme } from "@orasso/design-system/native";
import { proV2Labels } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { DirBig } from "@/features/pro/kit";
import { api } from "@/lib/api";
import { formatCount, gradeBars } from "@/lib/proPresta";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";

const { space2, space3 } = tokens.spacing;

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
          <DirBig
            testID="pro-stats-big"
            items={[
              { value: formatCount(s.views), label: proV2Labels.views, testID: "pro-stats-views" },
              { value: formatCount(s.discounts), label: proV2Labels.discounts, testID: "pro-stats-discounts" },
            ]}
          />

          <View
            style={[styles.block, { backgroundColor: t.color.surface, boxShadow: t.shadow.shadowCard }]}
            testID="pro-stats-grades"
          >
            <Text variant="label" color={t.color.inkMuted}>
              {proV2Labels.byGrade}
            </Text>
            {gradeBars(s.discountsByGrade).map((bar) => (
              <View key={bar.grade} style={styles.barRow}>
                <Text variant="bodyStrong" color={t.color.ink} style={styles.barLabel}>
                  {bar.label}
                </Text>
                <View style={[styles.track, { backgroundColor: t.color.line }]}>
                  <View style={[styles.fill, { width: `${bar.percent}%`, backgroundColor: t.color.ink }]} />
                </View>
                <Text variant="bodyStrong" color={t.color.ink} style={styles.barCount}>
                  {bar.count}
                </Text>
              </View>
            ))}
          </View>

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
  // `.card.p.stack` : carte, rayon 18, 16 px ; `.bars` : 90 px | piste | 54 px, 8 px d'écart.
  block: { gap: space3, padding: tokens.spacing.space4, borderRadius: tokens.radius.radiusLg },
  barRow: { flexDirection: "row", alignItems: "center", gap: space2 },
  barLabel: { width: 90, fontSize: 13 },
  track: { flex: 1, height: 12, borderRadius: 6, overflow: "hidden" },
  fill: { height: 12, borderRadius: 6 },
  barCount: { width: 54, textAlign: "right", fontSize: 13 },
});
