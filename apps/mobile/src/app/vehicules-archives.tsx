// Mes véhicules archivés (lot 40) : vendus, souvenirs, accidentés, rangés par statut, chacun ouvre sa fiche. Ouvert
// depuis Mon profil : un visiteur (aucun véhicule actif) n'a plus d'onglet Garage, ses archivés restent ici.
import { Chip, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type VehicleStatus, vehicleStatusLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { FlowScreen } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;
const ARCHIVED: Exclude<VehicleStatus, "active">[] = ["sold", "keepsake", "wrecked"];

export default function VehiculesArchives() {
  const { t } = useTheme();
  const router = useRouter();
  const vehicles = useApi(() => api.vehicles(), [], { cacheKey: "vehicles" });
  const archived = vehicles.data?.filter((v) => v.status !== "active") ?? [];
  return (
    <FlowScreen
      title="Mes véhicules archivés"
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/moi"))}
      onRefresh={vehicles.reload}
    >
      {archived.length === 0 ? (
        <Muted variant="body">{vehicles.loading ? "Chargement…" : "Aucun véhicule archivé."}</Muted>
      ) : null}
      {ARCHIVED.map((status) => {
        const rows = archived.filter((v) => v.status === status);
        if (!rows.length) return null;
        return (
          <View key={status} style={styles.group}>
            <Chip>{vehicleStatusLabels[status]}</Chip>
            {rows.map((v) => (
              <Pressable
                key={v.id}
                accessibilityRole="link"
                accessibilityLabel={v.label}
                onPress={() => router.push(`/vehicule/${v.id}`)}
                testID="archived-vehicle"
              >
                <Plate style={styles.row}>
                  <Text variant="bodyStrong" color={t.color.plateInk}>
                    {v.label}
                  </Text>
                  <Text variant="meta" color={t.color.plateMuted}>
                    {[v.year, v.statusNote].filter(Boolean).join(" · ")}
                  </Text>
                </Plate>
              </Pressable>
            ))}
          </View>
        );
      })}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  group: { gap: space2 },
  row: { gap: space1, padding: space3 },
});
