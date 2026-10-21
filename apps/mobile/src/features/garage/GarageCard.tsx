// Carte d'un véhicule du garage (lot 51, prototype `s-garage` ; reproduite fidèlement au lot C2b).
// Première carte `.veh` : photo pleine largeur 220 px, étiquettes inclinées (première catégorie pleine, les autres au
// trait), nom entier en Archivo large italique 22 px (jamais tronqué), sous-ligne étroite « 3.0 · 2021 · blanche »,
// trois chiffres étroits séparés par des pointillés (ch / kg / événements), « Partager sa carte » et le crayon.
// Cartes suivantes `.veh.sm` : vignette de 120 px à gauche, une étiquette, nom 15 px, sous-ligne.
import { Chip, Photo, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import { vehicleWizardLabels as L, plateTransferLabels, type VehicleFull } from "@orasso/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { Num, SmButton } from "@/features/passionne/kit";
import { api } from "@/lib/api";
import { mediaSource } from "@/lib/media";
import { useApi } from "@/lib/useApi";

const { space1, space2, space3, space4 } = tokens.spacing;

/** « 1 495 » : espace fine insécable des milliers, comme le prototype. */
const narrowNumber = (n: number) => n.toLocaleString("fr-FR").replace(/\s/g, " ");

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
  const photo = mediaSource(vehicle.photos[0]?.url);
  const placeholder = `linear-gradient(135deg, ${c.surfaceRaised} 0%, ${c.night} 100%)`;
  const open = () => router.push(`/vehicule/${vehicle.id}`);

  if (!first) {
    // `.veh.sm` : vignette à gauche, texte à droite.
    const smallTrim = [vehicle.year ? String(vehicle.year) : null, vehicle.color?.toLowerCase() ?? null]
      .concat(vehicle.powerHp ? [`${narrowNumber(vehicle.powerHp)} ch`] : [])
      .filter(Boolean)
      .join(" · ");
    return (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={vehicle.label}
        onPress={open}
        testID="garage-card"
        style={[styles.veh, styles.vehSm, { backgroundColor: c.surface, boxShadow: t.shadow.shadowPoster }]}
      >
        <View style={[styles.smPhoto, { backgroundColor: c.surfaceSunken }]}>
          <Photo source={photo} placeholder={placeholder} style={StyleSheet.absoluteFill} />
        </View>
        <View style={styles.smBody}>
          {vehicle.categories[0] ? <Tag tone="line">{vehicle.categories[0].label}</Tag> : null}
          <Text variant="posterM" color={c.ink} style={styles.smName} testID="garage-card-name">
            {vehicle.label}
          </Text>
          {smallTrim ? (
            <Text variant="meta" color={c.inkMuted} style={styles.trim}>
              {smallTrim}
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  }

  const specs: [string, string][] = [
    [vehicle.powerHp ? narrowNumber(vehicle.powerHp) : "—", "ch"],
    [vehicle.weightKg ? narrowNumber(vehicle.weightKg) : "—", "kg"],
    [events !== null ? narrowNumber(events) : "—", L.events],
  ];
  const facts = vehicle.plateTransfer ? plateTransferLabels.pending : vehicle.photos.length === 0 ? L.needPhoto : null;

  return (
    <View style={[styles.veh, { backgroundColor: c.surface, boxShadow: t.shadow.shadowPoster }]}>
      <Pressable accessibilityRole="link" accessibilityLabel={vehicle.label} onPress={open} testID="garage-card">
        <View style={[styles.photo, { backgroundColor: c.surfaceSunken }]}>
          <Photo source={photo} placeholder={placeholder} style={StyleSheet.absoluteFill} />
          {vehicle.certified || prizes > 0 ? (
            <View style={styles.badges}>
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
          ) : null}
        </View>
        <View style={styles.body}>
          {vehicle.categories.length ? (
            <View style={styles.tags}>
              {vehicle.categories.map((cat, i) => (
                <Tag key={cat.id} tone={i === 0 ? "ink" : "line"}>
                  {cat.label}
                </Tag>
              ))}
            </View>
          ) : null}
          <View>
            <Text variant="posterL" color={c.ink} style={styles.name} testID="garage-card-name">
              {vehicle.label}
            </Text>
            {trim ? (
              <Text variant="meta" color={c.inkMuted} style={styles.trim}>
                {trim}
              </Text>
            ) : null}
          </View>
          <View style={[styles.specs, { borderColor: c.line }]}>
            {specs.map(([value, unit], i) => (
              <View key={unit} style={[styles.spec, i > 0 && [styles.specSep, { borderColor: c.line }]]}>
                <Num size={28}>{value}</Num>
                <Text variant="caption" color={c.inkMuted} style={styles.specUnit}>
                  {unit}
                </Text>
              </View>
            ))}
          </View>
          {facts ? (
            <Text variant="caption" color={c.inkMuted}>
              {facts}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <View style={styles.actions}>
        <SmButton kind="s" icon="share" onPress={() => onShare(vehicle)} style={styles.grow} testID="garage-share">
          {L.share}
        </SmButton>
        <SmButton
          kind="s"
          icon="edit"
          onPress={() => router.push(`/vehicule/${vehicle.id}/modifier`)}
          accessibilityLabel={L.editVehicle}
          testID="garage-edit"
        />
      </View>
      <Text variant="credit" color={c.inkMuted} style={styles.credit}>
        Orasso
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  veh: { borderRadius: 22, overflow: "hidden", position: "relative" },
  photo: { height: 220, overflow: "hidden" },
  badges: { position: "absolute", top: space2, left: space2, flexDirection: "row", gap: space1 },
  body: { gap: space2 + 2, paddingTop: space3 + 2, paddingHorizontal: space4 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space1 + 2 },
  name: { fontSize: 22, lineHeight: 21 },
  trim: { fontSize: 13, textTransform: "uppercase" },
  specs: { flexDirection: "row", borderTopWidth: 1, borderBottomWidth: 1, borderStyle: "dashed" },
  spec: { flex: 1, paddingVertical: space2 + 2, gap: 2 },
  specSep: { borderLeftWidth: 1, borderStyle: "dashed", paddingLeft: space3 },
  specUnit: { fontSize: 11.5, lineHeight: 14 },
  actions: {
    flexDirection: "row",
    gap: space2 + 2,
    paddingHorizontal: space4,
    paddingTop: space2 + 2,
    paddingBottom: space4,
  },
  grow: { flex: 1, alignSelf: "stretch" },
  credit: { position: "absolute", right: space3, bottom: space1 },
  vehSm: { flexDirection: "row", alignItems: "stretch" },
  smPhoto: { width: 120, minHeight: 110, overflow: "hidden" },
  smBody: { flex: 1, gap: space2, padding: space3 + 2 },
  smName: { fontSize: 15, lineHeight: 16 },
});
