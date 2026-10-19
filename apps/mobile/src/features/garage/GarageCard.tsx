// Grande carte d'un véhicule du garage (lot 51, prototype `s-garage`) : photo de couverture, catégories, nom entier
// (jamais tronqué, deux lignes au besoin), sous-ligne « 3.0 · 2021 · blanche », chiffres étroits (ch, kg, événements),
// « Certifié », « Prix du public », « Partager sa carte » en un geste, le crayon ouvre les cinq étapes préremplies.
import { Button, Chip, Photo, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { vehicleWizardLabels as L, plateTransferLabels, type VehicleFull } from "@orasso/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { mediaSource } from "@/lib/media";
import { useApi } from "@/lib/useApi";

const { space1, space2, space3 } = tokens.spacing;

/** « 1 495 » : espace fine insécable des milliers, comme le prototype. */
const narrowNumber = (n: number) => n.toLocaleString("fr-FR").replace(/\s/g, " ");

/** Sous-ligne de la carte : motorisation, année, couleur en minuscules. */
export function trimLine(v: Pick<VehicleFull, "engine" | "year" | "color">): string | null {
  const parts = [v.engine?.trim() || null, v.year ? String(v.year) : null, v.color ? v.color.toLowerCase() : null];
  const line = parts.filter(Boolean).join(" · ");
  return line || null;
}

/** Prix du public gagnés (lot 49 : `vehicles.audience_prizes`) ; 0 tant que l'API ne les sert pas. */
export function audiencePrizesOf(v: VehicleFull): number {
  const n = (v as VehicleFull & { audiencePrizes?: unknown }).audiencePrizes;
  return typeof n === "number" && n > 0 ? n : 0;
}

export function GarageCard({
  vehicle,
  first,
  onShare,
}: {
  vehicle: VehicleFull;
  first: boolean;
  onShare: (vehicle: VehicleFull) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  // Événements où ce véhicule est entré (pointé sur place).
  const history = useApi(() => api.vehicleHistory(vehicle.id), [vehicle.id], {
    cacheKey: `vehicle-history-${vehicle.id}`,
  });
  const events = history.data ? history.data.filter((h) => h.attended).length : null;
  const prizes = audiencePrizesOf(vehicle);
  const trim = trimLine(vehicle);
  const specs: [string, string][] = [];
  if (vehicle.powerHp) specs.push([narrowNumber(vehicle.powerHp), "ch"]);
  if (vehicle.weightKg) specs.push([narrowNumber(vehicle.weightKg), "kg"]);
  if (events !== null) specs.push([narrowNumber(events), L.events]);
  const facts = vehicle.plateTransfer ? plateTransferLabels.pending : vehicle.photos.length === 0 ? L.needPhoto : null;

  return (
    <Plate style={styles.card}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={vehicle.label}
        onPress={() => router.push(`/vehicule/${vehicle.id}`)}
        testID="garage-card"
      >
        <View style={[styles.photo, { height: first ? 200 : 150, backgroundColor: c.surfaceSunken }]}>
          <Photo
            source={mediaSource(vehicle.photos[0]?.url)}
            placeholder={`linear-gradient(135deg, ${c.surfaceRaised} 0%, ${c.night} 100%)`}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.tags}>
            {vehicle.certified ? (
              <Chip variant="verified" selected>
                {L.certified}
              </Chip>
            ) : null}
            {prizes > 0 ? (
              <Chip variant="accent" selected>
                {prizes > 1 ? `${L.audiencePrize} ×${prizes}` : L.audiencePrize}
              </Chip>
            ) : null}
          </View>
        </View>
        <View style={styles.body}>
          {vehicle.categories.length ? (
            <View style={styles.chips}>
              {vehicle.categories.map((cat, i) => (
                <Chip key={cat.id} surface="plate" selected={i === 0}>
                  {cat.label}
                </Chip>
              ))}
            </View>
          ) : null}
          <View>
            <Text variant="posterM" color={c.plateInk} testID="garage-card-name">
              {vehicle.label}
            </Text>
            {trim ? (
              <Text variant="meta" color={c.plateMuted}>
                {trim}
              </Text>
            ) : null}
          </View>
          {specs.length ? (
            <View style={styles.specs}>
              {specs.map(([value, unit]) => (
                <View key={unit} style={styles.spec}>
                  <Text variant="numberNarrow" color={c.plateInk}>
                    {value}
                  </Text>
                  <Text variant="label" color={c.plateMuted}>
                    {unit}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {facts ? (
            <Text variant="caption" color={c.plateMuted}>
              {facts}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <View style={styles.actions}>
        <View style={styles.grow}>
          <Button variant="secondary" icon="share" onPress={() => onShare(vehicle)} fullWidth testID="garage-share">
            {L.share}
          </Button>
        </View>
        <Button
          variant="plate"
          icon="list"
          onPress={() => router.push(`/vehicule/${vehicle.id}/modifier`)}
          accessibilityLabel={L.editVehicle}
          testID="garage-edit"
        >
          Modifier
        </Button>
      </View>
    </Plate>
  );
}

const styles = StyleSheet.create({
  card: { overflow: "hidden", paddingHorizontal: 0, paddingVertical: 0 },
  photo: { overflow: "hidden" },
  tags: { position: "absolute", top: space2, left: space2, flexDirection: "row", gap: space1 },
  body: { gap: space2, paddingTop: space3, paddingHorizontal: space3 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space1 },
  specs: { flexDirection: "row", gap: space3 + space2 },
  spec: { flexDirection: "row", alignItems: "baseline", gap: space1 },
  actions: { flexDirection: "row", gap: space2, padding: space3 },
  grow: { flex: 1 },
});
