// Garage : « mon garage, c'est moi ». En-tête (photo, pseudo, grade et points, pastille QR de compte), puis mes
// véhicules actifs en grandes cartes, l'ajout d'un véhicule et les archivés repliés en bas.
import { gradeLabels, vehicleStatusLabels, type VehicleFull } from "@orasso/shared";
import { Button, Chip, Plate, Text, tokens, useTheme, VehicleCard } from "@orasso/design-system/native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { AccountQrSheet } from "@/features/AccountQrSheet";
import { api } from "@/lib/endpoints";
import { mediaSource } from "@/lib/media";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Avatar } from "@/ui/Avatar";
import { Notice } from "@/ui/Notice";
import { SectionTitle, TabScreen } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;

export default function Garage() {
  const { t } = useTheme();
  const router = useRouter();
  const { me } = useSession();
  const vehicles = useApi(() => api.vehicles(), [], { cacheKey: "vehicles" });
  const [qr, setQr] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const profile = me?.profile;
  const active = vehicles.data?.filter((v) => v.status === "active") ?? [];
  const archived = vehicles.data?.filter((v) => v.status !== "active") ?? [];

  return (
    <TabScreen title="Mon garage" onRefresh={vehicles.reload}>
      {vehicles.offline ? <Notice>Hors ligne : ton garage tel que ton téléphone l'a gardé.</Notice> : null}

      <Plate style={styles.profile}>
        <View style={styles.profileHead}>
          <Avatar url={profile?.avatarUrl} pseudo={profile?.pseudo} size={56} />
          <View style={styles.profileText}>
            <Text variant="posterL" color={t.color.plateInk}>
              {profile?.pseudo}
            </Text>
            <Text variant="meta" color={t.color.plateMuted}>
              {profile?.visibility === "private" ? "Compte privé" : "Compte public"}
              {profile && profile.departments.length > 0 ? ` · ${profile.departments.join(", ")}` : ""}
            </Text>
          </View>
        </View>
        <View style={styles.gradeRow}>
          <Chip variant="accent" surface="plate">
            {profile ? `${gradeLabels[profile.grade]} · ${profile.pointsSeason} pts` : ""}
          </Chip>
          <Button variant="plate" icon="qr" onPress={() => setQr(true)}>
            QR
          </Button>
        </View>
      </Plate>

      <View style={styles.sectionHead}>
        <SectionTitle>Véhicules actifs · {active.length}</SectionTitle>
        <Button variant="secondary" icon="add" onPress={() => router.push("/vehicule/nouveau")}>
          Ajouter
        </Button>
      </View>

      {active.length === 0 && !vehicles.loading ? (
        <Plate kind="note" style={styles.empty}>
          <Text variant="body" color={t.color.plateInk}>
            Ton garage est vide. Ajoute ton premier véhicule : tu en auras besoin pour candidater.
          </Text>
        </Plate>
      ) : null}
      {active.map((v, i) => (
        <GarageCard key={v.id} vehicle={v} first={i === 0} />
      ))}

      {archived.length > 0 ? (
        <>
          <Button
            variant="plate"
            icon={showArchived ? "close" : "list"}
            onPress={() => setShowArchived((s) => !s)}
            fullWidth
          >
            {`Archivés · ${archived.length}`}
          </Button>
          {showArchived
            ? archived.map((v) => (
                <Plate key={v.id} style={styles.archived}>
                  <Text variant="bodyStrong" color={t.color.plateInk}>
                    {v.label}
                  </Text>
                  <Text variant="meta" color={t.color.plateMuted}>
                    {vehicleStatusLabels[v.status]}
                  </Text>
                </Plate>
              ))
            : null}
        </>
      ) : null}

      <AccountQrSheet visible={qr} onClose={() => setQr(false)} />
    </TabScreen>
  );
}

function GarageCard({ vehicle, first }: { vehicle: VehicleFull; first: boolean }) {
  const { t } = useTheme();
  return (
    <VehicleCard
      first={first}
      name={vehicle.label}
      year={vehicle.year ?? undefined}
      power={vehicle.powerHp ? `${vehicle.powerHp} ch` : undefined}
      certified={vehicle.certified}
      photoCount={vehicle.photos.length > 1 ? vehicle.photos.length : undefined}
      photo={{
        source: mediaSource(vehicle.photos[0]?.url),
        placeholder: `linear-gradient(135deg, ${t.color.surfaceRaised} 0%, ${t.color.night} 100%)`,
      }}
      categories={vehicle.categories.map((c) => ({ label: c.label }))}
    />
  );
}

const styles = StyleSheet.create({
  profile: { gap: space3, padding: space3 },
  profileHead: { flexDirection: "row", alignItems: "center", gap: space3 },
  profileText: { flex: 1, gap: space1 },
  gradeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space2 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space2 },
  empty: { gap: space2 },
  archived: { gap: space1, padding: space3 },
});
