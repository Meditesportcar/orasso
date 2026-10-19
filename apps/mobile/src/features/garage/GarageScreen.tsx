// Garage v2 (lot 51, prototype `s-garage`) : grand titre « Mon garage · N véhicules », mes crews (docs/02), demandes de
// transfert de plaque reçues, grandes cartes des véhicules actifs, « Ajouter un véhicule · Marque, photos, plaque
// floutée : deux minutes. », archivés repliés en bas. Le pseudo, le grade et le QR de compte vivent dans Mon profil
// depuis le lot 40 (réponse à « Montrer mon QR » qui débordait). L'onglet n'existe que pour l'exposant (lot 40) ; un
// garage vide montre l'état vide du O.
import { Button, Chip, EmptyState, Icon, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  crewLabels,
  vehicleWizardLabels as L,
  type VehicleFull,
  type VehicleStatus,
  vehicleStatusLabels,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { CrewLogo } from "@/features/crews/CrewLogo";
import { PlateTransferCard } from "@/features/garage/PlateTransferCard";
import { ShareSheet } from "@/features/vehicle/ShareSheet";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";
import { GarageCard } from "./GarageCard";

const { space1, space2, space3 } = tokens.spacing;

const ARCHIVED: Exclude<VehicleStatus, "active">[] = ["sold", "keepsake", "wrecked"];

export function GarageScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const vehicles = useApi(() => api.vehicles(), [], { cacheKey: "vehicles" });
  const transfers = useApi(() => api.plateTransfers(), []);
  const crews = useApi(() => api.myCrews(), []);
  const [showArchived, setShowArchived] = useState(false);
  const [sharing, setSharing] = useState<VehicleFull | null>(null);
  const active = vehicles.data?.filter((v) => v.status === "active") ?? [];
  const archived = vehicles.data?.filter((v) => v.status !== "active") ?? [];
  const add = () => router.push("/vehicule/nouveau");

  return (
    <TabScreen
      title={L.garageTitle}
      facts={vehicles.data ? L.garageCount(active.length) : undefined}
      onRefresh={async () => {
        await Promise.all([vehicles.reload(), transfers.reload(), crews.reload()]);
      }}
      overlays={
        sharing ? (
          <ShareSheet vehicleId={sharing.id} version={sharing.shareVersion} visible onClose={() => setSharing(null)} />
        ) : null
      }
    >
      {vehicles.offline ? <Notice>Hors ligne : ton garage tel que ton téléphone l'a gardé.</Notice> : null}

      {/* Mes crews (lot 19, docs/02 « Garage ») : logos, la fiche au toucher ; créer un crew s'il n'y en a pas. */}
      <View style={styles.crews} testID="garage-crews">
        {(crews.data ?? []).map((c) => (
          <Pressable
            key={c.id}
            accessibilityRole="link"
            accessibilityLabel={c.name}
            onPress={() => router.push(`/crew/${c.slug}`)}
          >
            <CrewLogo url={c.logoUrl} name={c.name} size={32} />
          </Pressable>
        ))}
        {crews.data && crews.data.length === 0 ? (
          <Chip onPress={() => router.push("/crew/nouveau")}>{crewLabels.createCrew}</Chip>
        ) : null}
      </View>

      {(transfers.data?.incoming ?? []).map((tr) => (
        <PlateTransferCard
          key={tr.id}
          transfer={tr}
          onDone={async () => {
            await Promise.all([vehicles.reload(), transfers.reload()]);
          }}
        />
      ))}

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
        <GarageCard key={v.id} vehicle={v} first={i === 0} onShare={setSharing} />
      ))}

      {active.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${L.addVehicle}. ${L.addVehicleHint}`}
          onPress={add}
          testID="garage-add"
          style={[styles.add, { borderColor: t.color.line }]}
        >
          <View style={[styles.addIcon, { backgroundColor: t.color.accent }]}>
            <Icon name="add" size={22} color={t.color.accentInk} />
          </View>
          <View style={styles.addText}>
            <Text variant="bodyStrong" color={t.color.ink}>
              {L.addVehicle}
            </Text>
            <Text variant="caption" color={t.color.inkMuted}>
              {L.addVehicleHint}
            </Text>
          </View>
          <Icon name="next" size={20} color={t.color.inkMuted} />
        </Pressable>
      ) : null}

      {archived.length > 0 ? (
        <>
          <Button
            variant="plate"
            icon={showArchived ? "close" : "list"}
            onPress={() => setShowArchived((s) => !s)}
            fullWidth
          >
            {L.archived(archived.length)}
          </Button>
          {showArchived
            ? ARCHIVED.map((status) => {
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
                      >
                        <Plate style={styles.archived}>
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
              })
            : null}
        </>
      ) : null}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  crews: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space2 },
  add: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: space3,
    borderRadius: tokens.radius.radiusMd,
    borderWidth: 2,
    borderStyle: "dashed",
  },
  addIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  addText: { flex: 1, gap: space1 },
  archived: { gap: space1, padding: space3 },
  group: { gap: space2 },
});
