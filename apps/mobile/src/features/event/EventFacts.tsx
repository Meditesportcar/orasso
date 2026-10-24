// Corps de la fiche v2 (lot 44, `s-event`) : chips (format, « Gratuit »), nom, description ; l'organisateur (logo,
// « Validée », abonnés, Suivre) ; les quatre faits : Quand, Où (« voir la carte » → la carte stylée), Exposants
// (places restantes), Public. Lot C2b : reproduits d'après `s-event` (`.tag` inclinées, `.orgrow` avec logo rond
// ou initiales moutarde, `.pill-o` « Validée », `.btn.sm` Suivre ; `.fact` sur la carte, chiffres étroits 34 px).
// Lot M4 (maquette 4.1) : les quatre tuiles deviennent une fiche compacte en lignes (`EventRows`), l'admission passe en
// étiquettes avec un « ? » (`AdmissionTags`).
import { Icon, type IconName, OrgLogo, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  arrivalTime,
  type EventPublic,
  eventAdmissionLabels,
  eventFormatLabels,
  eventPageLabels as L,
  previewSummary,
  publicAccessText,
  type StructurePublic,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { type ReactNode, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { ExplorerMap } from "@/features/explorer/ExplorerMap";
import { eventPins } from "@/features/explorer/mapPins";
import { PillO, SmButton } from "@/features/passionne/kit";
import { nowMs } from "@/lib/clock";
import { formatEventDay, formatHour } from "@/lib/format";
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

/** Lot M4 : la ligne d'une fiche compacte (`.frow` de la maquette 4.1) : pastille d'icône, texte, à droite un aperçu. */
function Row({
  icon,
  title,
  sub,
  right,
  extra,
  testID,
}: {
  icon: IconName;
  title: string;
  sub?: string | null;
  right?: ReactNode;
  extra?: ReactNode;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={styles.row} testID={testID}>
      <View style={[styles.rowIcon, { backgroundColor: c.surfaceSunken }]}>
        <Icon name={icon} size={18} color={c.ink} />
      </View>
      <View style={styles.rowText}>
        <Text variant="bodyStrong" color={c.ink} style={styles.rowB}>
          {title}
        </Text>
        {sub ? (
          <Text variant="caption" color={c.inkMuted} style={styles.rowSmall}>
            {sub}
          </Text>
        ) : null}
        {extra}
      </View>
      {right}
    </View>
  );
}

/** Lot M4 : l'aperçu du lieu (`.miniplan`, 92 × 70) : terre, mer, routes aux jetons de la carte, l'épingle moutarde. */
function MiniPlan() {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={[styles.miniplan, { borderColor: c.cardLine }]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 92 70" preserveAspectRatio="xMidYMid slice">
        <Rect x={0} y={0} width={92} height={70} fill={c.mapSea} />
        <Path d="M0 0H70C64 18 72 30 62 44C56 54 60 62 56 70H0Z" fill={c.mapLand} />
        <Path d="M0 50C20 44 34 52 48 40C54 35 58 28 66 26" stroke={c.mapRoad} strokeWidth={2.5} fill="none" />
        <Path d="M14 0C18 20 24 36 22 70" stroke={c.mapRoad} strokeWidth={1.5} fill="none" opacity={0.6} />
        <Path
          d="M46 34s-7-6.2-7-11.7a7 7 0 0 1 14 0c0 5.5-7 11.7-7 11.7z"
          fill={c.accent}
          stroke={c.night}
          strokeWidth={1.2}
        />
        <Circle cx={46} cy={22.3} r={2.5} fill={c.night} />
      </Svg>
    </View>
  );
}

/** Lot M4 : jauge des places exposants (`.seatbar`), moutarde au-delà de 70 % pris. */
function SeatBar({ taken }: { taken: number }) {
  const { t } = useTheme();
  const c = t.color;
  const pct = Math.max(0, Math.min(1, taken));
  return (
    <View style={[styles.gauge, { backgroundColor: c.surfaceSunken }]}>
      <View
        style={[
          styles.gaugeFill,
          { width: `${Math.round(pct * 100)}%`, backgroundColor: pct > 0.7 ? c.accent : c.ink },
        ]}
      />
    </View>
  );
}

/**
 * Fiche compacte (lot M4, maquette 4.1) : quatre lignes au lieu des quatre tuiles. Quand (l'horaire de l'événement, jamais
 * le créneau des exposants, privé), Où (mini-plan ; toucher = la carte stylée, dépliée dessous), places exposants en
 * barre de remplissage, Public (et son heure d'arrivée seulement si elle est stricte : pas d'horaire « conseillé »).
 */
export function EventRows({ event }: { event: EventPublic }) {
  const { t } = useTheme();
  const c = t.color;
  const [map, setMap] = useState(false);
  const pins = useMemo(() => eventPins([event], new Date(nowMs())), [event]);
  const city = [event.postalCode, event.city].filter(Boolean).join(" ");
  const multi = (event.days?.length ?? 0) > 1;
  const when = `${formatHour(event.startsAt)} → ${formatHour(event.endsAt)}${multi ? ` · ${event.days.length} jours` : ""}`;
  const whereTitle = event.addressLine ?? event.city ?? "";
  const whereSub = [
    event.distanceKm != null ? `${Math.round(event.distanceKm)} km` : null,
    event.addressLine ? city : null,
    event.entranceNote,
  ]
    .filter(Boolean)
    .join(" · ");
  const pub = event.arrivals?.public?.strict ? event.arrivals.public : null;
  const taken = event.remaining !== null && event.capacity ? (event.capacity - event.remaining) / event.capacity : null;
  const day = formatEventDay(event.startsAt, event.endsAt);
  // Lot R4b, tour 2 : après la fin, plus de ligne des places (avec le plateau des présentes, elle dirait les absents).
  const ended = new Date(event.endsAt).getTime() <= nowMs();
  return (
    <View style={styles.factsWrap}>
      <View style={[styles.rows, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}>
        <Row icon="calendar" title={day.charAt(0).toUpperCase() + day.slice(1)} sub={when} testID="event-when" />
        <View style={[styles.sep, { borderTopColor: c.line }]} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${L.where} : ${[whereTitle, city].filter(Boolean).join(", ")}, ${map ? L.hideMap : L.seeMap}`}
          onPress={() => setMap((m) => !m)}
          disabled={pins.length === 0}
          testID="event-where"
        >
          <Row icon="place" title={whereTitle} sub={whereSub || null} right={pins.length > 0 ? <MiniPlan /> : null} />
        </Pressable>
        {ended ? null : (
          <>
            <View style={[styles.sep, { borderTopColor: c.line }]} />
            <Row
              icon="vehicle"
              title={event.remaining !== null ? L.seatsRow(event.remaining) : L.seatsNoLimit}
              sub={[
                event.capacity ? L.seatsOf(event.capacity) : null,
                eventAdmissionLabels[event.admission].toLowerCase(),
              ]
                .filter(Boolean)
                .join(" · ")}
              extra={taken !== null ? <SeatBar taken={taken} /> : null}
              testID="event-seats"
            />
          </>
        )}
        <View style={[styles.sep, { borderTopColor: c.line }]} />
        <Row
          icon="eye"
          title={L.publicRow(publicAccessText(event.publicAccess, event.externalTicketUrl))}
          sub={pub ? L.publicFrom(arrivalTime(pub.from)) : null}
          testID="event-public"
        />
      </View>
      {map && pins.length > 0 ? (
        <ExplorerMap pins={pins} selectedId={event.id} onSelect={() => undefined} reveal={false}>
          {whereTitle ? (
            <Text variant="meta" color={c.inkMuted}>
              {[whereTitle, city].filter(Boolean).join(", ")}
            </Text>
          ) : null}
        </ExplorerMap>
      ) : null}
    </View>
  );
}

/**
 * Lot M4 (maquette 4.1) : l'admission en étiquettes (Sur filtration, Avant-première…), chacune avec un « ? » qui
 * l'explique en une phrase, sous les étiquettes.
 */
export function AdmissionTags({ event }: { event: EventPublic }) {
  const { t } = useTheme();
  const c = t.color;
  const [open, setOpen] = useState<string | null>(null);
  const items: { key: string; label: string; help: string; acc: boolean }[] = [
    {
      key: "admission",
      label: eventAdmissionLabels[event.admission],
      help: L.admissionHelp[event.admission] ?? "",
      acc: true,
    },
  ];
  const preview = previewSummary(event);
  if (preview && event.previewHours > 0) {
    items.push({ key: "preview", label: preview, help: L.previewHelp(event.previewHours), acc: false });
  }
  if (event.maxVehiclesPerUser > 1) {
    items.push({
      key: "max",
      label: `${event.maxVehiclesPerUser} véhicules par personne`,
      help: `Tu peux candidater avec ${event.maxVehiclesPerUser} véhicules au plus.`,
      acc: false,
    });
  }
  const shown = items.find((i) => i.key === open);
  return (
    <View style={styles.adm} testID="event-admission">
      <Text variant="label" color={c.inkMuted}>
        {L.admission}
      </Text>
      <View style={styles.admRow}>
        {items.map((i) => (
          <View key={i.key} style={styles.admItem}>
            <Tag tone={i.acc ? "ink" : "line"}>{i.label}</Tag>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${i.label} : c'est quoi ?`}
              accessibilityState={{ expanded: open === i.key }}
              onPress={() => setOpen((o) => (o === i.key ? null : i.key))}
              hitSlop={10}
              style={styles.q}
              testID={`admission-help-${i.key}`}
            >
              <Icon name="help" size={18} color={open === i.key ? c.accentText : c.inkMuted} />
            </Pressable>
          </View>
        ))}
      </View>
      {shown ? (
        <Text variant="caption" color={c.inkMuted} style={styles.admHelp} testID="admission-help-text">
          {shown.help}
        </Text>
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
  // `.frows` : rayon 18 ; `.frow` : 12 × 14, filet pointillé entre deux lignes.
  rows: { borderRadius: 18, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: space3, paddingVertical: space3, paddingHorizontal: 14 },
  rowIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, minWidth: 0 },
  rowB: { fontFamily: "Archivo-ExtraBold", fontSize: 14.5, lineHeight: 18 },
  rowSmall: { fontSize: 12.5, lineHeight: 16 },
  sep: { borderTopWidth: 1, borderStyle: "dashed", marginHorizontal: 0 },
  miniplan: { width: 92, height: 70, borderRadius: 12, overflow: "hidden", borderWidth: 1 },
  gauge: { height: 8, borderRadius: 4, overflow: "hidden", marginTop: 6 },
  gaugeFill: { height: 8, borderRadius: 4 },
  adm: { gap: space2 },
  admRow: { flexDirection: "row", flexWrap: "wrap", gap: space2, alignItems: "center" },
  admItem: { flexDirection: "row", alignItems: "center", gap: 2 },
  q: { width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  admHelp: { fontSize: 12.5, lineHeight: 17 },
});
