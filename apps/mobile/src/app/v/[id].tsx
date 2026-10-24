// Véhicule d'un autre (lot 17, ARCHITECTURE-SUITE § 2.5) : la fiche selon le compte de son propriétaire (complète si
// public ou ami, marque et modèle sinon, jamais la plaque) et « Autres propriétaires près de chez moi ».
import { Button, Chip, Photo, Plate, Text, tokens, useTheme, VehicleCard } from "@orasso/design-system/native";
import { gradeLabels, socialLabels, vehicleAddLabels } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ReportButton } from "@/features/ReportSheet";
import { PersonRow } from "@/features/social/PersonRow";
import { PhotoViewer } from "@/features/vehicle/PhotoViewer";
import { api } from "@/lib/api";
import { mediaSource } from "@/lib/media";
import { useApi } from "@/lib/useApi";
import { Avatar } from "@/ui/Avatar";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;

export default function OtherVehiclePage() {
  const { t } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const vehicle = useApi(() => api.otherVehicle(id), [id]);
  const nearby = useApi(() => api.ownersNearby(id), [id], { enabled: Boolean(vehicle.data) });
  const v = vehicle.data;
  const [viewer, setViewer] = useState<number | null>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (!v) {
    return (
      <FlowScreen title="Véhicule" onClose={close}>
        {vehicle.error ? (
          <Notice tone="error">
            {vehicle.error.status === 404 ? "Ce véhicule n'existe pas ou plus." : vehicle.error.message}
          </Notice>
        ) : (
          <Muted variant="body">Chargement…</Muted>
        )}
      </FlowScreen>
    );
  }

  const full = "photos" in v ? v : null;
  const reload = async () => {
    await Promise.all([vehicle.reload(), nearby.reload()]);
  };
  return (
    <FlowScreen title="Véhicule" onClose={close} onRefresh={reload}>
      <View testID="vehicule" accessibilityLabel={v.label} style={styles.col}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Photos de ${v.label} en plein écran`}
          disabled={!full || full.photos.length === 0}
          onPress={() => setViewer(0)}
          testID="photos-open"
        >
          <VehicleCard
            first
            name={v.label}
            certified={full?.certified}
            year={full?.year ?? undefined}
            power={full?.powerHp ? `${full.powerHp} ch` : undefined}
            photoCount={full && full.photos.length > 1 ? full.photos.length : undefined}
            categories={v.categories.map((c) => ({ label: c.label }))}
            photo={{
              // Lot R4b : compte privé, la photo (plaque masquée) est montrée aussi.
              source: mediaSource(full ? full.photos[0]?.url : "photoUrl" in v ? v.photoUrl : null),
              placeholder: `linear-gradient(135deg, ${t.color.surfaceRaised} 0%, ${t.color.night} 100%)`,
            }}
          />
        </Pressable>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Profil de ${v.owner.pseudo}`}
          onPress={() => router.push(`/u/${encodeURIComponent(v.owner.pseudo)}`)}
        >
          <Plate style={styles.owner} testID="vehicule-owner">
            <Avatar url={v.owner.avatarUrl} pseudo={v.owner.pseudo} size={40} />
            <Text variant="posterS" color={t.color.plateInk} style={styles.ownerName}>
              {v.owner.pseudo}
            </Text>
            <Chip surface="plate">{gradeLabels[v.owner.grade]}</Chip>
          </Plate>
        </Pressable>
        <ReportButton type="vehicle" id={v.id} />
        {!v.detailed ? <Notice>{socialLabels.privateNotice}</Notice> : null}
        {full ? (
          <Plate style={styles.facts}>
            {full.generationName ? <Fact label="Génération" value={full.generationName} /> : null}
            {full.version ? <Fact label={vehicleAddLabels.versionFact} value={full.version} /> : null}
            {full.engine ? <Fact label="Moteur" value={full.engine} /> : null}
            {full.weightKg ? <Fact label="Poids" value={`${full.weightKg} kg`} /> : null}
            {full.color ? <Fact label="Couleur" value={full.color} /> : null}
            {full.description ? (
              <Text variant="body" color={t.color.plateInk}>
                {full.description}
              </Text>
            ) : null}
            {full.preparation ? (
              <Text variant="body" color={t.color.plateMuted}>
                {full.preparation}
              </Text>
            ) : null}
          </Plate>
        ) : null}
        {/* Photos (lot 32) : toucher ouvre la visionneuse plein écran, d'où l'on peut signaler la photo. */}
        {full && full.photos.length > 1
          ? full.photos.slice(1).map((p, i) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityLabel={`Photo ${i + 2} en plein écran`}
                onPress={() => setViewer(i + 1)}
              >
                <Photo
                  source={mediaSource(p.url)}
                  placeholder={`linear-gradient(135deg, ${t.color.surfaceRaised} 0%, ${t.color.night} 100%)`}
                  style={styles.photo}
                />
              </Pressable>
            ))
          : null}
        {full ? <PhotoViewer photos={full.photos} start={viewer} onClose={() => setViewer(null)} reportable /> : null}
      </View>

      <SectionTitle>{socialLabels.ownersNearby}</SectionTitle>
      <Muted variant="caption">{socialLabels.ownersNearbyHint}</Muted>
      {nearby.data && nearby.data.sector.length === 0 ? (
        <View style={styles.col}>
          <Notice>{socialLabels.ownersNearbyNoSector}</Notice>
          <Button variant="secondary" icon="place" onPress={() => router.push("/moi")} fullWidth>
            Mon secteur
          </Button>
        </View>
      ) : nearby.data && nearby.data.items.length === 0 ? (
        <Muted variant="body">{socialLabels.ownersNearbyEmpty}</Muted>
      ) : (
        nearby.data?.items.map((person) => (
          <PersonRow key={person.userId} person={person} onChanged={() => void nearby.reload()} />
        ))
      )}
    </FlowScreen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const { t } = useTheme();
  return (
    <View style={styles.fact}>
      <Text variant="label" color={t.color.plateMuted}>
        {label}
      </Text>
      <Text variant="bodyStrong" color={t.color.plateInk}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  col: { gap: space3 },
  owner: { flexDirection: "row", alignItems: "center", gap: space3, padding: space3 },
  ownerName: { flex: 1 },
  facts: { gap: space2, padding: space3 },
  fact: { gap: space1 },
  photo: { width: "100%", aspectRatio: 4 / 3, borderRadius: tokens.radius.radiusSm },
});
