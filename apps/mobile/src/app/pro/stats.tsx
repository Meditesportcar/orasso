// Casquette Pro, Stats (30 derniers jours) : vues de la fiche, clics « appeler » et « itinéraire », abonnés, remises
// utilisées (scans du QR de compte).
import { Counters, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { gradeLabels, grades } from "@orasso/shared";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/endpoints";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;

export default function ProStats() {
  const { t } = useTheme();
  const router = useRouter();
  const myPro = useApi(() => api.myPro(), [], { cacheKey: "my-pro" });
  const proId = myPro.data?.id;
  const stats = useApi(() => api.proStats(proId ?? ""), [proId], { enabled: Boolean(proId), cacheKey: "pro-stats" });
  const s = stats.data;
  return (
    <FlowScreen
      title="Stats"
      facts="30 derniers jours"
      onClose={() => router.replace("/accueil")}
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
          <Counters
            items={[
              { value: s.views, label: "vues" },
              { value: s.calls, label: "appels" },
              { value: s.routes, label: "itinéraires" },
            ]}
          />
          <Counters
            items={[
              { value: s.followers, label: "abonnés" },
              { value: s.discounts, label: "remises utilisées" },
            ]}
          />
          <SectionTitle>Remises utilisées par grade</SectionTitle>
          <Plate style={styles.block}>
            {grades.some((g) => s.discountsByGrade[g]) ? (
              grades.map((g) => (
                <View key={g} style={styles.row}>
                  <Text variant="body" color={t.color.plateInk}>
                    {gradeLabels[g]}
                  </Text>
                  <Text variant="bodyStrong" color={t.color.plateInk}>
                    {s.discountsByGrade[g] ?? 0}
                  </Text>
                </View>
              ))
            ) : (
              <Text variant="body" color={t.color.plateMuted}>
                Aucune remise utilisée pour l'instant.
              </Text>
            )}
          </Plate>
          <Muted variant="caption">Tes propres visites de ta fiche ne sont pas comptées.</Muted>
        </>
      )}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: space1 },
});
