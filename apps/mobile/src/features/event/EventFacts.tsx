// Corps de la fiche v2 (lot 44, `s-event`) : chips (format, « Gratuit »), nom, description ; l'organisateur (logo,
// « Validée », abonnés, Suivre) ; les quatre faits : Quand, Où (« voir la carte » → la carte stylée), Exposants
// (places restantes), Public.
import { Button, Chip, ChipRow, Icon, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type EventPublic,
  eventFormatLabels,
  eventPageLabels as L,
  publicAccessText,
  type StructurePublic,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { type ReactNode, useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";

import { ExplorerMap } from "@/features/explorer/ExplorerMap";
import { eventPins } from "@/features/explorer/mapPins";
import { formatDay, formatHour } from "@/lib/format";

const { space1, space2, space3 } = tokens.spacing;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

export function EventTitle({ event }: { event: EventPublic }) {
  const { t } = useTheme();
  const free = event.publicAccess === "free" || event.publicAccess === "free_reservation";
  return (
    <View style={styles.titleBlock}>
      <ChipRow>
        <Chip variant="accent">{eventFormatLabels[event.format]}</Chip>
        {free ? <Chip>{L.free}</Chip> : null}
      </ChipRow>
      <Text variant="posterL" color={t.color.ink} accessibilityRole="header">
        {event.title}
      </Text>
      {event.description ? (
        <Text variant="body" color={t.color.inkMuted}>
          {event.description}
        </Text>
      ) : null}
    </View>
  );
}

/** L'organisateur : la ligne ouvre sa page ; « Suivre » s'abonne (avant-première). */
export function OrganizerRow({
  event,
  structure,
  busy,
  onFollow,
}: {
  event: EventPublic;
  structure: StructurePublic | null;
  busy: boolean;
  onFollow: () => void;
}) {
  const { t } = useTheme();
  const router = useRouter();
  const logo = structure?.logoUrl ?? event.structure.logoUrl;
  return (
    <Plate style={styles.org}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Organisateur : ${event.structure.name}`}
        onPress={() => router.push(`/o/${event.structure.slug}`)}
        style={styles.orgLink}
        testID="event-organizer"
      >
        {logo ? (
          <Image source={{ uri: logo }} style={styles.orgLogo} accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.orgLogo, { backgroundColor: t.color.night }]}>
            <Text variant="label" color={t.color.nightInk}>
              {initials(event.structure.name)}
            </Text>
          </View>
        )}
        <View style={styles.orgText}>
          <Text variant="bodyStrong" color={t.color.plateInk}>
            {event.structure.name}
          </Text>
          <View style={styles.orgMeta}>
            <Chip variant="verified" surface="plate">
              {L.organizerValidated}
            </Chip>
            {structure ? (
              <Text variant="meta" color={t.color.plateMuted}>
                {L.followers(structure.followersCount)}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
      <Button
        variant="plate"
        icon={structure?.isFollowing ? "check" : "add"}
        loading={busy}
        onPress={onFollow}
        testID="follow-structure"
      >
        {structure?.isFollowing ? L.following : L.follow}
      </Button>
    </Plate>
  );
}

function Fact({
  icon,
  label,
  children,
  testID,
  inside,
}: {
  icon: "calendar" | "place" | "vehicle" | "eye";
  label: string;
  children: ReactNode;
  testID?: string;
  /** Posé dans un bouton qui prend déjà la place de la case. */
  inside?: boolean;
}) {
  const { t } = useTheme();
  return (
    <Plate style={[styles.fact, inside && styles.factInside]} testID={testID}>
      <View style={styles.factLabel}>
        <Icon name={icon} size={14} color={t.color.plateMuted} />
        <Text variant="label" color={t.color.plateMuted}>
          {label}
        </Text>
      </View>
      {children}
    </Plate>
  );
}

export function EventFactsGrid({ event }: { event: EventPublic }) {
  const { t } = useTheme();
  const c = t.color;
  const [map, setMap] = useState(false);
  const pins = useMemo(() => eventPins([event]), [event]);
  const place = [event.addressLine, [event.postalCode, event.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return (
    <View style={styles.factsWrap}>
      <View style={styles.facts}>
        <Fact icon="calendar" label={L.when}>
          <Text variant="bodyStrong" color={c.plateInk}>
            {formatDay(event.startsAt)}
          </Text>
          <Text variant="meta" color={c.plateMuted}>
            {formatHour(event.startsAt)} → {formatHour(event.endsAt)}
          </Text>
        </Fact>
        <Pressable
          style={styles.factPress}
          accessibilityRole="button"
          accessibilityLabel={`${L.where} : ${place || event.city || ""}, ${map ? L.hideMap : L.seeMap}`}
          onPress={() => setMap((m) => !m)}
          disabled={pins.length === 0}
          testID="event-where"
        >
          <Fact icon="place" label={L.where} inside>
            <Text variant="bodyStrong" color={c.plateInk}>
              {event.city ?? place}
            </Text>
            <Text variant="meta" color={c.plateMuted}>
              {pins.length > 0 ? (map ? L.hideMap : L.seeMap) : place}
            </Text>
          </Fact>
        </Pressable>
        <Fact icon="vehicle" label={L.exhibitors} testID="event-seats">
          {event.remaining !== null && event.capacity !== null ? (
            <Text variant="numberNarrow" color={c.plateInk}>
              {event.remaining}
              <Text variant="meta" color={c.plateMuted}>
                /{event.capacity}
              </Text>
            </Text>
          ) : (
            <Text variant="bodyStrong" color={c.plateInk}>
              ∞
            </Text>
          )}
          <Text variant="meta" color={c.plateMuted}>
            {event.remaining !== null ? L.seatsLeft : L.noLimit}
          </Text>
        </Fact>
        <Fact icon="eye" label={L.publicTitle}>
          <Text variant="bodyStrong" color={c.plateInk}>
            {publicAccessText(event.publicAccess, event.externalTicketUrl)}
          </Text>
        </Fact>
      </View>
      {map && pins.length > 0 ? (
        <ExplorerMap pins={pins} selectedId={event.id} onSelect={() => undefined} reveal={false}>
          {place ? (
            <Text variant="meta" color={c.inkMuted}>
              {place}
            </Text>
          ) : null}
        </ExplorerMap>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  titleBlock: { gap: space2 },
  org: { flexDirection: "row", alignItems: "center", gap: space2, padding: space2 },
  orgLink: { flex: 1, flexDirection: "row", alignItems: "center", gap: space2 },
  orgLogo: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.radiusMd,
    alignItems: "center",
    justifyContent: "center",
  },
  orgText: { flex: 1, gap: space1 },
  orgMeta: { flexDirection: "row", alignItems: "center", gap: space2, flexWrap: "wrap" },
  factsWrap: { gap: space2 },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  fact: { flexBasis: "47%", flexGrow: 1, gap: space1, padding: space3 },
  factPress: { flexBasis: "47%", flexGrow: 1 },
  factInside: { flexBasis: "auto", flexGrow: 1 },
  factLabel: { flexDirection: "row", alignItems: "center", gap: space1 },
});
