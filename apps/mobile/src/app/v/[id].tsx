// Véhicule d'un autre (lot 17, ARCHITECTURE-SUITE § 2.5) : la fiche selon le compte de son propriétaire (complète si
// public ou ami, marque et modèle sinon, jamais la plaque) et « Autres propriétaires près de chez moi ».
import { Button, Chip, Photo, Plate, Text, tokens, useTheme, VehicleCard } from "@orasso/design-system/native";
import { gradeLabels, socialLabels } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { PersonRow } from "@/features/social/PersonRow";
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

  const close = () => (router.canGoBack() ? router.back() : router.replace("/explorer"));

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
        <VehicleCard
          first
          name={v.label}
          certified={full?.certified}
          year={full?.year ?? undefined}
          power={full?.powerHp ? `${full.powerHp} ch` : undefined}
          photoCount={full && full.photos.length > 1 ? full.photos.length : undefined}
          categories={full?.categories.map((c) => ({ label: c.label }))}
          photo={{
            source: mediaSource(full?.photos[0]?.url),
            placeholder: `linear-gradient(135deg, ${t.color.surfaceRaised} 0%, ${t.color.night} 100%)`,
          }}
        />
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
        {!v.detailed ? <Notice>{socialLabels.privateNotice}</Notice> : null}
        {full ? (
          <Plate style={styles.facts}>
            {full.generationName ? <Fact label="Génération" value={full.generationName} /> : null}
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
        {full && full.photos.length > 1
          ? full.photos
              .slice(1)
              .map((p) => (
                <Photo
                  key={p.id}
                  source={mediaSource(p.url)}
                  placeholder={`linear-gradient(135deg, ${t.color.surfaceRaised} 0%, ${t.color.night} 100%)`}
                  style={styles.photo}
                />
              ))
          : null}
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
  photo: { width: "100%", aspectRatio: 4 / 3, borderRadius: 8 },
});
