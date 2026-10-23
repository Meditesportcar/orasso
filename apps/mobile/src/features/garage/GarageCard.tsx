// Carte d'un véhicule du garage (lot 51, prototype `s-garage` ; lot C2b ; lot M5 : maquette 7.1 et correction de Damien).
// Premier véhicule : une mini-fiche qui ne prend plus tout l'écran : la photo au carré (et les suivantes en vignettes),
// les infos brèves (étiquettes, nom entier jamais tronqué, motorisation · année · couleur, trois chiffres étroits, des
// tirets quand ils manquent), la ligne d'état de la certification (ce qui manque en premier, détail au toucher) et
// « Partager » · « Modifier ». Véhicules suivants `.veh.sm` : vignette carrée à gauche, une étiquette, nom, sous-ligne.
import { Chip, Photo, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import { vehicleWizardLabels as L, plateTransferLabels, type VehicleFull } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from "react-native";

import { fitWordSize, WIDE_EM } from "@/features/home/fit";
import { Num, SmButton } from "@/features/passionne/kit";
import { api } from "@/lib/api";
import { mediaSource } from "@/lib/media";
import { useApi } from "@/lib/useApi";
import { CertificationRow, CertificationSheet } from "./CertificationSheet";

const { space1, space2, space3 } = tokens.spacing;

/** « 1 495 » : espace fine insécable des milliers, comme le prototype. */
const narrowNumber = (n: number) => n.toLocaleString("fr-FR").replace(/\s/g, " ");
/** Photo de couverture de la mini-fiche (carré). */
const COVER = 116;
/** Vignettes des photos suivantes. */
const THUMB = 44;
const MAX_THUMBS = 4;

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
  round = 0,
}: {
  vehicle: VehicleFull;
  first: boolean;
  onShare: (vehicle: VehicleFull) => void;
  /** Change à chaque « tirer pour actualiser » du Garage (tour 2) : la certification se relit. */
  round?: number;
}) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const [infoW, setInfoW] = useState(0);
  const [certOpen, setCertOpen] = useState(false);
  // Événements où ce véhicule est entré (pointé sur place).
  const history = useApi(() => api.vehicleHistory(vehicle.id), [vehicle.id], {
    cacheKey: `vehicle-history-${vehicle.id}`,
  });
  // L'état de la certification (`GET /me/vehicles/:id`), pour la mini-fiche seulement.
  const detail = useApi(() => api.vehicle(vehicle.id), [vehicle.id, vehicle.shareVersion, round], { enabled: first });
  const events = history.data ? history.data.filter((h) => h.attended).length : null;
  const prizes = audiencePrizesOf(vehicle);
  const trim = trimLine(vehicle);
  const photo = mediaSource(vehicle.photos[0]?.url);
  const placeholder = `linear-gradient(135deg, ${c.surfaceRaised} 0%, ${c.night} 100%)`;
  const open = () => router.push(`/vehicule/${vehicle.id}`);

  if (!first) {
    // `.veh.sm` : vignette carrée à gauche (format maître 1:1, décision du 10), texte à droite.
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
  const nameSize = fitWordSize(vehicle.label, infoW, 19, 12, WIDE_EM);
  const onInfo = (e: LayoutChangeEvent) => setInfoW(e.nativeEvent.layout.width);
  const thumbs = vehicle.photos.slice(1, 1 + MAX_THUMBS);
  const more = vehicle.photos.length - 1 - thumbs.length;
  // Tour 2 : la fiche détaillée (même lecture que « ce qui manque ») donne le nombre de photos de la ligne d'état.
  const cert = detail.data?.id === vehicle.id ? detail.data.certification : null;
  const certPhotos = detail.data?.id === vehicle.id ? detail.data.photos.length : vehicle.photos.length;

  return (
    <View
      style={[styles.veh, styles.mini, { backgroundColor: c.surface, boxShadow: t.shadow.shadowPoster }]}
      testID="garage-mini"
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={vehicle.label}
        onPress={open}
        testID="garage-card"
        style={({ pressed }) => [styles.top, pressed && styles.pressed]}
      >
        <View style={[styles.cover, { backgroundColor: c.surfaceSunken }]} testID="garage-cover">
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
        <View style={styles.info} onLayout={onInfo}>
          {vehicle.categories.length ? (
            <View style={styles.tags}>
              {vehicle.categories.map((cat, i) => (
                <Tag key={cat.id} tone={i === 0 ? "ink" : "line"}>
                  {cat.label}
                </Tag>
              ))}
            </View>
          ) : null}
          <Text
            variant="posterM"
            color={c.ink}
            style={{ fontSize: nameSize, lineHeight: Math.round(nameSize * 1.02) }}
            testID="garage-card-name"
          >
            {vehicle.label}
          </Text>
          {trim ? (
            <Text variant="meta" color={c.inkMuted} style={styles.trim}>
              {trim}
            </Text>
          ) : null}
        </View>
      </Pressable>

      {thumbs.length ? (
        <View style={styles.thumbs} testID="garage-thumbs">
          {thumbs.map((p) => (
            <View key={p.id} style={[styles.thumb, { backgroundColor: c.surfaceSunken }]}>
              <Photo source={mediaSource(p.url)} placeholder={placeholder} style={StyleSheet.absoluteFill} />
            </View>
          ))}
          {more > 0 ? (
            <View style={[styles.thumb, styles.more, { backgroundColor: c.surfaceRaised }]}>
              <Text variant="bodyStrong" color={c.ink}>{`+${more}`}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.specs, { borderColor: c.line }]}>
        {specs.map(([value, unit], i) => (
          <View key={unit} style={[styles.spec, i > 0 && [styles.specSep, { borderColor: c.line }]]}>
            <Num size={22}>{value}</Num>
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

      {cert ? <CertificationRow cert={cert} photoCount={certPhotos} onPress={() => setCertOpen(true)} /> : null}

      <View style={styles.actions}>
        <SmButton
          kind="s"
          icon="share"
          onPress={() => onShare(vehicle)}
          style={styles.grow}
          accessibilityLabel={L.share}
          testID="garage-share"
        >
          Partager
        </SmButton>
        <SmButton
          kind="s"
          icon="edit"
          onPress={() => router.push(`/vehicule/${vehicle.id}/modifier`)}
          style={styles.grow}
          accessibilityLabel={L.editVehicle}
          testID="garage-edit"
        >
          Modifier
        </SmButton>
      </View>
      {/* Le crédit « Orasso » de l'artefact (`.credit`), sous les boutons pour ne rien recouvrir. */}
      <Text variant="credit" color={c.inkMuted} style={styles.credit}>
        Orasso
      </Text>
      {cert ? (
        <CertificationSheet
          visible={certOpen}
          onClose={() => setCertOpen(false)}
          vehicleId={vehicle.id}
          photoCount={certPhotos}
          cert={cert}
          onChanged={() => detail.reload()}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  veh: { borderRadius: 22, overflow: "hidden", position: "relative" },
  mini: { padding: space3, paddingBottom: space3 + 10, gap: space2 + 2 },
  credit: { position: "absolute", right: space3, bottom: 2 },
  top: { flexDirection: "row", gap: space3, alignItems: "flex-start" },
  pressed: { opacity: 0.85 },
  cover: { width: COVER, height: COVER, borderRadius: 14, overflow: "hidden" },
  badges: { position: "absolute", top: space1, left: space1, gap: space1 },
  info: { flex: 1, minWidth: 0, gap: space1 + 2 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space1 + 2 },
  trim: { fontSize: 12, textTransform: "uppercase" },
  thumbs: { flexDirection: "row", gap: space1 + 2 },
  thumb: { width: THUMB, height: THUMB, borderRadius: 10, overflow: "hidden" },
  more: { alignItems: "center", justifyContent: "center" },
  specs: { flexDirection: "row", borderTopWidth: 1, borderBottomWidth: 1, borderStyle: "dashed" },
  spec: { flex: 1, paddingVertical: space2, gap: 0 },
  specSep: { borderLeftWidth: 1, borderStyle: "dashed", paddingLeft: space3 },
  specUnit: { fontSize: 11.5, lineHeight: 14 },
  actions: { flexDirection: "row", gap: space2 + 2 },
  grow: { flex: 1, alignSelf: "stretch" },
  vehSm: { flexDirection: "row", alignItems: "stretch" },
  smPhoto: { width: 120, aspectRatio: 1, overflow: "hidden" },
  smBody: { flex: 1, gap: space2, padding: space3 + 2 },
  smName: { fontSize: 15, lineHeight: 16 },
});
