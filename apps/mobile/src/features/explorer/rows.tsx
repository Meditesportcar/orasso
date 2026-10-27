// Lignes de l'Explorer et de la recherche : un événement, un pro, un véhicule trouvé. Tout est un lien ; un nom
// (d'événement, de pro, de véhicule) ne se tronque jamais.
import { Chip, ChipRow, Photo, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  countFr,
  type EventCard,
  eventFormatLabels,
  eventHints,
  explorerLabels,
  gradeLabels,
  type ProCard,
  proActivityLabels,
  proHints,
  type SearchVehicleHit,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { formatDay, formatHour } from "@/lib/format";
import { mediaSource } from "@/lib/media";
import { Avatar } from "@/ui/Avatar";

const { space1, space2, space3 } = tokens.spacing;

export function EventRow({ event, hints = true }: { event: EventCard; hints?: boolean }) {
  const { t } = useTheme();
  const router = useRouter();
  const chips = hints ? eventHints(event) : [];
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={event.title}
      onPress={() => router.push(`/e/${event.slug}`)}
      testID="event-row"
    >
      <Plate style={styles.row}>
        <Photo
          source={mediaSource(event.posterUrl)}
          placeholder={`linear-gradient(135deg, ${t.color.surfaceRaised} 0%, ${t.color.night} 100%)`}
          cut="thumb"
          style={styles.thumb}
        />
        <View style={styles.body}>
          <Text variant="label" color={t.color.plateMuted}>
            {eventFormatLabels[event.format]}
            {event.outlook === "uncertain" ? " · Incertain" : ""}
            {event.status === "cancelled" ? " · Annulé" : ""}
          </Text>
          <Text variant="posterM" color={t.color.plateInk}>
            {event.title}
          </Text>
          <Text variant="meta" color={t.color.plateMuted}>
            {formatDay(event.startsAt)} · {formatHour(event.startsAt)}
            {event.city ? ` · ${event.city}` : ""}
          </Text>
          <Text variant="meta" color={t.color.plateMuted}>
            {event.remaining === null
              ? "Places libres"
              : event.remaining > 0
                ? countFr(event.remaining, "place")
                : "Complet"}
            {` · ${event.structure.name}`}
          </Text>
          {chips.length > 0 ? (
            <ChipRow>
              {chips.map((hint) => (
                <Chip key={hint} surface="plate" variant="accent">
                  {hint}
                </Chip>
              ))}
            </ChipRow>
          ) : null}
        </View>
      </Plate>
    </Pressable>
  );
}

export function ProRow({ pro, hints = true }: { pro: ProCard; hints?: boolean }) {
  const { t } = useTheme();
  const router = useRouter();
  const where = pro.city
    ? [pro.city, pro.department].filter(Boolean).join(" · ")
    : pro.interventionDepartments.length > 0
      ? `Intervient : ${pro.interventionDepartments.join(", ")}`
      : "";
  const chips = hints ? proHints(pro) : [];
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={pro.name}
      onPress={() => router.push(`/p/${pro.slug}`)}
      testID="pro-row"
    >
      <Plate style={styles.row}>
        <Photo
          source={mediaSource(pro.logoUrl)}
          placeholder={`linear-gradient(135deg, ${t.color.surfaceRaised} 0%, ${t.color.night} 100%)`}
          cut="thumb"
          style={styles.thumb}
        />
        <View style={styles.body}>
          <Text variant="label" color={t.color.plateMuted}>
            {pro.activities.map((a) => proActivityLabels[a]).join(" · ")}
          </Text>
          <Text variant="posterM" color={t.color.plateInk}>
            {pro.name}
          </Text>
          {where ? (
            <Text variant="meta" color={t.color.plateMuted}>
              {where}
            </Text>
          ) : null}
          <ChipRow>
            {pro.verified ? (
              <Chip surface="plate" variant="verified">
                {explorerLabels.verifiedPro}
              </Chip>
            ) : null}
            {chips.map((hint) => (
              <Chip key={hint} surface="plate" variant="accent">
                {hint}
              </Chip>
            ))}
          </ChipRow>
        </View>
      </Plate>
    </Pressable>
  );
}

/** Un véhicule trouvé : son nom en entier, puis son propriétaire (compte privé : marque et modèle seulement). */
export function VehicleHitRow({ hit }: { hit: SearchVehicleHit }) {
  const { t } = useTheme();
  const router = useRouter();
  return (
    <Plate style={styles.row} testID="vehicle-hit">
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={hit.label}
        onPress={() => router.push(`/v/${hit.id}`)}
        style={styles.body}
      >
        <Text variant="posterS" color={t.color.plateInk}>
          {hit.label}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Profil de ${hit.owner.pseudo}`}
        onPress={() => router.push(`/u/${encodeURIComponent(hit.owner.pseudo)}`)}
        style={styles.owner}
      >
        <Avatar url={hit.owner.avatarUrl} pseudo={hit.owner.pseudo} size={32} />
        <Text variant="meta" color={t.color.plateMuted}>
          {hit.owner.pseudo} · {gradeLabels[hit.owner.grade]}
        </Text>
      </Pressable>
    </Plate>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space3, padding: space3, alignItems: "center" },
  thumb: { width: 84, height: 84, borderRadius: tokens.radius.radiusSm },
  body: { flex: 1, gap: space1 },
  owner: { alignItems: "center", gap: space2, maxWidth: 120 },
});
