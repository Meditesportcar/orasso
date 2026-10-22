// Corps de la fiche v2 (lot 44, `s-event`) : chips (format, « Gratuit »), nom, description ; l'organisateur (logo,
// « Validée », abonnés, Suivre) ; les quatre faits : Quand, Où (« voir la carte » → la carte stylée), Exposants
// (places restantes), Public. Lot C2b : reproduits d'après `s-event` (`.tag` inclinées, `.orgrow` avec logo rond
// ou initiales moutarde, `.pill-o` « Validée », `.btn.sm` Suivre ; `.fact` sur la carte, chiffres étroits 34 px).
import { Icon, OrgLogo, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type EventPublic,
  eventFormatLabels,
  eventPageLabels as L,
  publicAccessText,
  type StructurePublic,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { type ReactNode, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ExplorerMap } from "@/features/explorer/ExplorerMap";
import { eventPins } from "@/features/explorer/mapPins";
import { Num, PillO, SmButton } from "@/features/passionne/kit";
import { formatDay, formatHour } from "@/lib/format";
import { mediaSource } from "@/lib/media";

const { space1, space2, space3 } = tokens.spacing;

/** Lot M3 : aussi avec la seule carte de la liste (aperçu, sans description ni accès public). */
export function EventTitle({
  event,
}: {
  event: Pick<EventPublic, "format" | "title"> & Partial<Pick<EventPublic, "publicAccess" | "description">>;
}) {
  const { t } = useTheme();
  const free = event.publicAccess === "free" || event.publicAccess === "free_reservation";
  return (
    <View style={styles.titleBlock}>
      <View style={styles.tags}>
        <Tag tone="acc">{eventFormatLabels[event.format]}</Tag>
        {free ? <Tag tone="line">{L.free}</Tag> : null}
      </View>
      <Text variant="posterL" color={t.color.ink} accessibilityRole="header" style={styles.title}>
        {event.title}
      </Text>
      {event.description ? (
        <Text variant="body" color={t.color.inkMuted} style={styles.desc}>
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
    <View style={[styles.org, { backgroundColor: t.color.surface, boxShadow: t.shadow.shadowCard }]}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Organisateur : ${event.structure.name}`}
        onPress={() => router.push(`/o/${event.structure.slug}`)}
        style={styles.orgLink}
        testID="event-organizer"
      >
        <OrgLogo name={event.structure.name} logoUrl={mediaSource(logo)?.uri ?? null} size={44} />
        <View style={styles.orgText}>
          <Text variant="bodyStrong" color={t.color.ink} style={styles.strong}>
            {event.structure.name}
          </Text>
          <View style={styles.orgMeta}>
            <PillO>{L.organizerValidated}</PillO>
            {structure ? (
              <Text variant="caption" color={t.color.inkMuted}>
                {L.followers(structure.followersCount)}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
      <SmButton
        kind="s"
        icon={structure?.isFollowing ? "check" : "add"}
        disabled={busy}
        onPress={onFollow}
        testID="follow-structure"
      >
        {structure?.isFollowing ? L.following : L.follow}
      </SmButton>
    </View>
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
    <View
      style={[
        styles.fact,
        { backgroundColor: t.color.surface, borderColor: t.color.cardLine },
        inside && styles.factInside,
      ]}
      testID={testID}
    >
      <View style={styles.factLabel}>
        <Icon name={icon} size={16} color={t.color.inkMuted} />
        <Text variant="label" color={t.color.inkMuted}>
          {label}
        </Text>
      </View>
      {children}
    </View>
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
          <Text variant="bodyStrong" color={c.ink} style={styles.factB}>
            {formatDay(event.startsAt)}
          </Text>
          <Text variant="caption" color={c.inkMuted} style={styles.factCap}>
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
            <Text variant="bodyStrong" color={c.ink} style={styles.factB}>
              {event.city ?? place}
            </Text>
            <Text variant="caption" color={c.inkMuted} style={styles.factCap}>
              {pins.length > 0 ? (map ? L.hideMap : L.seeMap) : place}
            </Text>
          </Fact>
        </Pressable>
        <Fact icon="vehicle" label={L.exhibitors} testID="event-seats">
          {event.remaining !== null && event.capacity !== null ? (
            <View style={styles.big}>
              <Num size={34}>{String(event.remaining)}</Num>
              <Num size={18} color={c.inkMuted}>{`/${event.capacity}`}</Num>
            </View>
          ) : (
            <Text variant="bodyStrong" color={c.ink} style={styles.factB}>
              ∞
            </Text>
          )}
          <Text variant="caption" color={c.inkMuted} style={styles.factCap}>
            {event.remaining !== null ? L.seatsLeft : L.noLimit}
          </Text>
        </Fact>
        <Fact icon="eye" label={L.publicTitle}>
          <Text variant="bodyStrong" color={c.ink} style={styles.factB}>
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
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space2 + 2 },
  title: { fontSize: 24, lineHeight: 23 },
  desc: { fontSize: 14.5, lineHeight: 21.75 },
  strong: { fontFamily: "Archivo-ExtraBold" },
  org: { flexDirection: "row", alignItems: "center", gap: space2 + 2, padding: space2 + 2, borderRadius: 16 },
  orgLink: { flex: 1, flexDirection: "row", alignItems: "center", gap: space2 },
  orgText: { flex: 1, gap: space1 },
  orgMeta: { flexDirection: "row", alignItems: "center", gap: space1 + 2, flexWrap: "wrap", marginTop: 3 },
  factsWrap: { gap: space2 },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  fact: { flexBasis: "47%", flexGrow: 1, gap: 2, padding: space3, borderRadius: 16, borderWidth: 1 },
  factB: { fontFamily: "Archivo-ExtraBold", fontSize: 15, lineHeight: 18 },
  factCap: { fontSize: 12.5 },
  big: { flexDirection: "row", alignItems: "baseline" },
  factPress: { flexBasis: "47%", flexGrow: 1 },
  factInside: { flexBasis: "auto", flexGrow: 1 },
  factLabel: { flexDirection: "row", alignItems: "center", gap: 5 },
});
