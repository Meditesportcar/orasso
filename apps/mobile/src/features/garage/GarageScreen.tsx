// Garage v2 (lot 51, prototype `s-garage` ; reproduit fidèlement au lot C2b) : grand titre « Mon garage · N
// véhicules », la grande carte du premier véhicule, les autres en cartes horizontales, « Ajouter un véhicule · Marque,
// photos, plaque floutée : deux minutes. » en pointillés, et une ligne « Archivés » en bas. Retirés (audit § 5.2) : les
// crews (Mon profil › Mon crew), les demandes de transfert de plaque (Boîte › Demandes). « Partager sa carte » ouvre
// l'écran de flux `/vehicule/<id>/partager`. Un garage vide montre l'état vide du O.
import { Button, EmptyState, Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { vehicleWizardLabels as L } from "@orasso/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { SmButton } from "@/features/passionne/kit";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";
import { GarageCard } from "./GarageCard";

const { space1, space3 } = tokens.spacing;

export function GarageScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const vehicles = useApi(() => api.vehicles(), [], { cacheKey: "vehicles" });
  const active = vehicles.data?.filter((v) => v.status === "active") ?? [];
  const archived = vehicles.data?.filter((v) => v.status !== "active") ?? [];
  const add = () => router.push("/vehicule/nouveau");

  return (
    <TabScreen
      title={L.garageTitle}
      facts={vehicles.data ? L.garageCount(active.length) : undefined}
      onRefresh={async () => {
        await vehicles.reload();
      }}
    >
      {vehicles.offline ? <Notice>Hors ligne : ton garage tel que ton téléphone l'a gardé.</Notice> : null}

      {active.length === 0 && !vehicles.loading ? (
        <EmptyState
          title={L.emptyTitle}
          text={L.emptyText}
          action={
            <Button variant="primary" icon="add" onPress={add} testID="garage-empty-add">
              {L.addVehicle}
            </Button>
          }
        />
      ) : null}
      {active.map((v, i) => (
        <GarageCard key={v.id} vehicle={v} first={i === 0} onShare={(v) => router.push(`/vehicule/${v.id}/partager`)} />
      ))}

      {active.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${L.addVehicle}. ${L.addVehicleHint}`}
          onPress={add}
          testID="garage-add"
          style={[styles.add, { borderColor: t.color.line }]}
        >
          <Icon name="o" size={56} color={t.color.inkMuted} />
          <View style={styles.addText}>
            <Text variant="bodyStrong" color={t.color.ink} style={styles.addTitle}>
              {L.addVehicle}
            </Text>
            <Text variant="caption" color={t.color.inkMuted}>
              {L.addVehicleHint}
            </Text>
          </View>
          <Icon name="add" size={20} color={t.color.ink} />
        </Pressable>
      ) : null}

      {/* Archivés : une ligne en bas du Garage (audit § 5.2), la liste vit dans « Mes véhicules archivés ». */}
      {archived.length > 0 ? (
        <SmButton kind="g" icon="list" onPress={() => router.push("/vehicules-archives")} testID="garage-archived">
          {L.archived(archived.length)}
        </SmButton>
      ) : null}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  add: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3 + 2,
    padding: space3 + 2,
    borderRadius: 20,
    borderWidth: 2,
    borderStyle: "dashed",
  },
  addTitle: { fontFamily: "Archivo-ExtraBold" },
  addText: { flex: 1, gap: space1 },
});
