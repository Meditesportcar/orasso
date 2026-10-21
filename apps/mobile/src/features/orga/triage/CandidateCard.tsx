// Carte d'une candidature à trier (lot 23, docs/01 « Informations affichées pendant le tri ») : photos en carrousel (on
// touche la moitié droite ou gauche : le glissement est réservé aux décisions), nom du véhicule en entier (deux lignes,
// jamais tronqué), candidat, historique, crew, avis de filtration, plaque et alertes. Rien de plus que ce que montre
// le tri du site : l'API borne déjà ce qu'elle renvoie (coordonnées au seul organisateur, jamais affichées ici).
import { Chip, ChipRow, Icon, OutlinedText, Photo, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type ApplicationAlert,
  type ApplicationForTriage,
  applicationStatusLabels,
  crewLabels,
  gradeLabels,
  orgaV2Labels,
  triageAppLabels,
} from "@orasso/shared";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { formatDayHour } from "@/lib/format";
import { mediaSource } from "@/lib/media";
import { plateText } from "@/ui/plateText";

const { space1, space2, space3 } = tokens.spacing;
const { radiusSm, radiusPill } = tokens.radius;

const alertLabels: Record<ApplicationAlert, string> = {
  duplicatePlate: triageAppLabels.alertDuplicatePlate,
  banned: triageAppLabels.alertBanned,
  unregistered: triageAppLabels.alertUnregistered,
};

/** Photos de la candidature : celles du véhicule, ou celles du prestataire. */
export function photosOf(item: ApplicationForTriage): { id: string; url: string }[] {
  if (item.vehicle) return item.vehicle.photos.map((p) => ({ id: p.id, url: p.url }));
  return item.provider?.photos ?? [];
}

/** Nom affiché : « BMW Série 3 E36 » ou le nom du prestataire. */
export const titleOf = (item: ApplicationForTriage): string =>
  item.vehicle?.label ?? item.provider?.name ?? triageAppLabels.vehicleGone;

export function PhotoCarousel({
  photos,
  label,
  certified = false,
  height,
  fallback = null,
}: {
  photos: { id: string; url: string }[];
  /** Photo affichée quand la candidature n'en a aucune (lot C4a). */
  fallback?: string | null;
  label: string;
  certified?: boolean;
  height: number;
}) {
  const { t } = useTheme();
  const [index, setIndex] = useState(0);
  const firstId = photos[0]?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: la première photo revient à chaque candidature
  useEffect(() => setIndex(0), [firstId]);
  const shown = photos[index];
  const go = (delta: number) => setIndex((i) => Math.min(Math.max(i + delta, 0), Math.max(photos.length - 1, 0)));
  return (
    <View style={[styles.photo, { height }]}>
      {shown ? (
        <Photo
          source={mediaSource(shown.url)}
          style={styles.fill}
          accessibilityLabel={`${label}. ${triageAppLabels.photoOf(index + 1, photos.length)}`}
        />
      ) : fallback ? (
        <Photo source={mediaSource(fallback)} style={styles.fill} accessibilityLabel={label} />
      ) : (
        <View style={[styles.fill, styles.noPhoto, { backgroundColor: t.color.plateChip }]}>
          <Text variant="meta" color={t.color.plateMuted}>
            {triageAppLabels.noPhoto}
          </Text>
        </View>
      )}
      {photos.length > 1 ? (
        <View style={styles.tapZones} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={triageAppLabels.previousPhoto}
            onPress={() => go(-1)}
            style={styles.fill}
            testID="triage-photo-prev"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={triageAppLabels.nextPhoto}
            onPress={() => go(1)}
            style={styles.fill}
            testID="triage-photo-next"
          />
        </View>
      ) : null}
      <View style={styles.dots} pointerEvents="none">
        {photos.map((p, i) => (
          <View
            key={p.id}
            style={[styles.dot, { backgroundColor: i === index ? t.color.plateInk : t.color.plateMuted }]}
          />
        ))}
      </View>
      {certified ? (
        <View style={styles.certified} pointerEvents="none">
          <Chip variant="verified" surface="plate">
            {triageAppLabels.certified}
          </Chip>
        </View>
      ) : null}
    </View>
  );
}

function Row({ label, children, alert = false }: { label: string; children: string; alert?: boolean }) {
  const { t } = useTheme();
  return (
    <View style={styles.row}>
      <Text variant="meta" color={t.color.plateMuted} style={styles.rowLabel}>
        {label}
      </Text>
      <Text variant="caption" color={alert ? plateText.alert : t.color.plateInk} style={styles.rowValue}>
        {children}
      </Text>
    </View>
  );
}

/** Les lignes « Candidat », « Avec nous », « Crew », « Filtration » et « Alertes » (carte et fiche complète). */
export function FactRows({ item, full = false }: { item: ApplicationForTriage; full?: boolean }) {
  const a = item.applicant;
  const crew = item.crew;
  const others = crew?.members.filter((m) => m.applicationId !== item.id) ?? [];
  const v = item.vehicle;
  return (
    <View style={styles.rows}>
      <Row label={triageAppLabels.applicant}>
        {`${a.pseudo} · ${gradeLabels[a.grade]} · ${triageAppLabels.applicantLine(a.eventsCount, a.absencesCount)}`}
      </Row>
      <Row label={triageAppLabels.withUs}>
        {a.historyWithStructure.total === 0
          ? triageAppLabels.firstApplication
          : triageAppLabels.historyLine(a.historyWithStructure.accepted, a.historyWithStructure.refused)}
      </Row>
      {crew ? (
        <Row label={triageAppLabels.crewRow}>
          {`${crew.name} · ${crewLabels.confirmedCount(crew.confirmed, crew.total)}${
            full || others.length === 0 ? "" : ` · ${others.length} ${crewLabels.triageCrewOthers.toLowerCase()}`
          }`}
        </Row>
      ) : null}
      {item.filteringOpinions.length > 0 ? (
        <Row label={triageAppLabels.filtering}>
          {item.filteringOpinions.map((o) => `« ${o.opinion} » ${o.pseudo}${o.note ? ` (${o.note})` : ""}`).join(", ")}
        </Row>
      ) : null}
      {v ? (
        <Row label={triageAppLabels.plate}>{v.unregistered ? triageAppLabels.unregistered : (v.plate ?? "—")}</Row>
      ) : null}
      {item.alerts.length > 0 ? (
        <Row label={triageAppLabels.alerts} alert>
          {item.alerts.map((x) => alertLabels[x]).join(", ")}
        </Row>
      ) : null}
      {full && others.length > 0 ? (
        <Row label={triageAppLabels.crewOthers}>
          {others.map((m) => `${m.pseudo} (${applicationStatusLabels[m.status].toLowerCase()})`).join(", ")}
        </Row>
      ) : null}
      {item.companions > 0 ? (
        <Row label={triageAppLabels.companionsRow}>{triageAppLabels.companions(item.companions)}</Row>
      ) : null}
      {item.message ? <Row label={triageAppLabels.message}>{item.message}</Row> : null}
      {full ? <Row label={triageAppLabels.appliedAt}>{formatDayHour(item.createdAt)}</Row> : null}
    </View>
  );
}

/** Une alerte en tête de carte : seule ligne qui attire l'œil (texte rouge de plaque, icône d'alerte). */
function AlertStrip({ alerts }: { alerts: ApplicationAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <View style={styles.alertStrip} accessibilityRole="alert">
      <Icon name="alert" size={16} color={plateText.alert} />
      <Text variant="meta" color={plateText.alert}>
        {alerts.map((x) => alertLabels[x]).join(" · ")}
      </Text>
    </View>
  );
}

/** Le corps de la carte (sans le geste) : la photo, le nom en entier, les faits. */
export function CandidateCard({
  item,
  photoHeight,
  fallbackPhoto = null,
}: {
  item: ApplicationForTriage;
  photoHeight: number;
  fallbackPhoto?: string | null;
}) {
  const { t } = useTheme();
  const v = item.vehicle;
  const p = item.provider;
  const specs = v
    ? [
        v.year,
        v.powerHp ? triageAppLabels.power(v.powerHp) : null,
        v.weightKg ? triageAppLabels.weight(v.weightKg) : null,
        v.country,
      ]
        .filter(Boolean)
        .join(" · ")
    : (p?.typeLabel ?? "");
  return (
    <Plate style={styles.card} testID="triage-card">
      <View>
        <PhotoCarousel
          photos={photosOf(item)}
          label={titleOf(item)}
          certified={Boolean(v?.certified)}
          height={photoHeight}
          fallback={fallbackPhoto}
        />
        {/* DA v2 (`s-otri`) : le nom en entier, contour couleur de la nuit, posé sur la grande photo. */}
        <View style={styles.overlay} pointerEvents="none">
          <OutlinedText variant="posterM" on="photo" color={t.color.barInk} testID="triage-vehicle">
            {titleOf(item)}
          </OutlinedText>
          {specs ? (
            <OutlinedText variant="meta" on="photo" color={t.color.barInk}>
              {specs}
            </OutlinedText>
          ) : null}
        </View>
      </View>
      <View style={styles.body}>
        {item.arrivalNote ? (
          <Text variant="bodyStrong" color={t.color.plateInk} testID="triage-arrival-note">
            {orgaV2Labels.triArrivalNote} : « {item.arrivalNote} »
          </Text>
        ) : null}
        {/* Une alerte reste en tête du corps : elle ne sort jamais de la carte. */}
        <AlertStrip alerts={item.alerts} />
        {p?.need ? <Chip surface="plate">{p.need.tradeLabel}</Chip> : null}
        {v && v.categories.length > 0 ? (
          <ChipRow>
            {v.categories.map((c) => (
              <Chip key={c.id} surface="plate">
                {c.label}
              </Chip>
            ))}
          </ChipRow>
        ) : null}
        {p && item.accreditedMedia ? <Chip surface="plate">{triageAppLabels.mediaAccredited}</Chip> : null}
        <FactRows item={item} />
      </View>
    </Plate>
  );
}

const styles = StyleSheet.create({
  card: { padding: 0, overflow: "hidden", gap: 0, flex: 1 },
  fill: { flex: 1 },
  photo: { overflow: "hidden" },
  noPhoto: { alignItems: "center", justifyContent: "center" },
  tapZones: { ...StyleSheet.absoluteFill, flexDirection: "row" },
  dots: { position: "absolute", left: space3, top: space2, flexDirection: "row", gap: space1 },
  overlay: { position: "absolute", left: space3, right: space3, bottom: space3, gap: space1 },
  dot: { width: 18, height: 3, borderRadius: radiusPill },
  certified: { position: "absolute", top: space2, right: space3 },
  body: { padding: space3, gap: space2, flexShrink: 1 },
  rows: { gap: space1 },
  row: { flexDirection: "row", gap: space2, alignItems: "flex-start" },
  rowLabel: { width: 92 },
  rowValue: { flex: 1 },
  alertStrip: { flexDirection: "row", alignItems: "center", gap: space1, borderRadius: radiusSm },
});
