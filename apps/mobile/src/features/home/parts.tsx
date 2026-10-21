// Pièces communes des accueils par profil (lot 43, prototype `s-home`) : la salutation, la carte du prochain événement
// (`PosterHero` du système de design depuis le lot C1), les petites tuiles, les lignes de liste, la tuile « nouveau ».
// Un seul bouton principal par carte ; les itinéraires sont des boutons secondaires.

import {
  Button,
  Icon,
  type IconName,
  OrgLogo,
  Plate,
  PosterHero,
  Text,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import {
  BUSINESS_TIMEZONE,
  type HomeOrganizer,
  homeProfileLabels,
  homeWidgetTitles,
  type MyWeather,
  weatherTexts,
} from "@orasso/shared";
import { useFocusEffect, useRouter } from "expo-router";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { WeatherWidget } from "@/features/WeatherWidget";
import { type Destination, openMaps, openWaze } from "@/lib/directions";
import { formatShortDate } from "@/lib/format";
import { kvGet, kvSet } from "@/lib/kv";
import { useSession } from "@/lib/session";
import { Muted } from "@/ui/Muted";
import { SectionTitle } from "@/ui/Screens";

const { space1, space2, space3, space4 } = tokens.spacing;

/** « Dimanche 18 octobre · Perpignan » : date du jour et ville (ou structure) de la salutation. */
export function Greeting({ line, name }: { line: string; name: string }) {
  const { t } = useTheme();
  return (
    <View style={styles.greeting} testID="home-greeting">
      <Text variant="label" color={t.color.ink}>
        {line}
      </Text>
      <Text variant="posterL" color={t.color.ink} accessibilityRole="header">
        {homeProfileLabels.greeting(name)}
      </Text>
    </View>
  );
}

export type HeroProps = {
  /** Photo de l'événement (lot C5) ; sans elle, l'affiche générée entière sur la scène de nuit. */
  photoUrl?: string | null;
  posterUrl: string | null;
  startsAt: string;
  /** « J-6 », « Demain », « Aujourd'hui » : en haut à droite de la photo. */
  countdown: string;
  /** « 19 h · ouverture » : en contour sur l'affiche. */
  hourLabel: string;
  title: string;
  /** Pastilles de statut (retenue, zone, emplacement…). */
  tags?: ReactNode;
  organizer: HomeOrganizer | null;
  /** Lignes d'information : lieu, arrivée, zone presse… */
  meta: { icon: IconName; text: string }[];
  /** Le bouton principal de l'écran. */
  action: { label: string; icon: IconName; onPress: () => void };
  destination: Destination;
  onMap: () => void;
  testID?: string;
};

/** Le logo de la structure (lot C1 : `OrgLogo` du système de design, rond ; repli : trois initiales moutarde). */
export function OrganizerLine({ organizer }: { organizer: HomeOrganizer }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={styles.org} testID="home-organizer">
      <OrgLogo name={organizer.name} logoUrl={organizer.logoUrl} size={34} />
      <View style={styles.orgText}>
        <Text variant="bodyStrong" color={c.plateInk}>
          {organizer.name}
        </Text>
        {organizer.verified ? (
          <View style={styles.orgOk}>
            <Icon name="badge" size={14} color={c.plateMuted} />
            <Text variant="caption" color={c.plateMuted}>
              {homeProfileLabels.structureValidated}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const WEEKDAY_FMT = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: BUSINESS_TIMEZONE });
const MONTH_FMT = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: BUSINESS_TIMEZONE });
const DAY_FMT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", timeZone: BUSINESS_TIMEZONE });
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * La carte du prochain événement (lot C1 : `PosterHero`, la `.poster.hn` de l'artefact) : photo en tête (sinon
 * l'affiche générée entière sur la scène de nuit), pavé de date moutarde, compte à rebours condensé, puis
 * l'organisateur, le lieu, l'arrivée, l'accès et les itinéraires.
 */
export function HeroCard({
  photoUrl,
  posterUrl,
  startsAt,
  countdown,
  hourLabel,
  title,
  tags,
  organizer,
  meta,
  action,
  destination,
  onMap,
  testID = "home-hero",
}: HeroProps) {
  const date = new Date(startsAt);
  return (
    <PosterHero
      testID={testID}
      countdownTestID="home-countdown"
      hourTestID="home-hour"
      photoUrl={photoUrl}
      posterUrl={posterUrl}
      weekday={cap(WEEKDAY_FMT.format(date))}
      day={DAY_FMT.format(date)}
      month={cap(MONTH_FMT.format(date))}
      countdown={countdown}
      hourLabel={hourLabel}
      title={title}
      tags={tags}
      organizer={
        organizer
          ? {
              name: organizer.name,
              logoUrl: organizer.logoUrl,
              verified: organizer.verified,
              subtitle: organizer.verified ? homeProfileLabels.structureValidated : null,
            }
          : null
      }
      meta={meta.map((m) => ({ icon: m.icon, text: m.text.charAt(0).toUpperCase() + m.text.slice(1) }))}
      action={{ ...action, testID: "home-hero-action" }}
      gps={[
        { label: homeProfileLabels.maps, icon: "nav", onPress: () => openMaps(destination), testID: "home-maps" },
        { label: homeProfileLabels.waze, icon: "nav", onPress: () => openWaze(destination), testID: "home-waze" },
        { label: homeProfileLabels.onMap, icon: "map", onPress: onMap, testID: "home-on-map" },
      ]}
    />
  );
}

/** Intitulé de section avec un lien à droite (« Tout voir »). */
export function SectionHead({ title, link, onLink }: { title: string; link?: string; onLink?: () => void }) {
  return (
    <View style={styles.sectionHead}>
      <View style={styles.fill}>
        <SectionTitle>{title}</SectionTitle>
      </View>
      {link && onLink ? (
        <Button variant="plate" tone="dashed" icon="next" onPress={onLink}>
          {link}
        </Button>
      ) : null}
    </View>
  );
}

/** Petite tuile (sortie suivante, mission proche, événement à couvrir) : un repère, un titre, une ligne. */
export function MiniTile({
  tag,
  title,
  caption,
  onPress,
  testID,
}: {
  tag: ReactNode;
  title: string;
  caption?: string;
  onPress?: () => void;
  testID?: string;
}) {
  const { t } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} testID={testID}>
      <Plate style={styles.mini}>
        <View style={styles.miniTag}>{tag}</View>
        <Text variant="bodyStrong" color={t.color.plateInk}>
          {title}
        </Text>
        {caption ? (
          <Text variant="caption" color={t.color.plateMuted}>
            {caption}
          </Text>
        ) : null}
      </Plate>
    </Pressable>
  );
}

/** Ligne de liste : la date en pastille, un titre, une ligne ; toute la ligne est un bouton. */
export function ListRow({
  date,
  leading,
  title,
  caption,
  trailing,
  onPress,
  testID,
}: {
  date?: string;
  leading?: ReactNode;
  title: string;
  caption?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? "button" : undefined} testID={testID}>
      <Plate style={styles.row}>
        {date ? (
          <Text variant="meta" color={c.plateMuted} style={styles.rowDate}>
            {formatShortDate(date)}
          </Text>
        ) : (
          leading
        )}
        <View style={styles.fill}>
          <Text variant="bodyStrong" color={c.plateInk}>
            {title}
          </Text>
          {caption ? (
            <Text variant="caption" color={c.plateMuted}>
              {caption}
            </Text>
          ) : null}
        </View>
        {trailing ?? (onPress ? <Icon name="next" size={18} color={c.plateMuted} /> : null)}
      </Plate>
    </Pressable>
  );
}

/** Une grosse tuile « note » : une étiquette, une phrase, une icône (Passeport, Contenus, Tu es staff). */
export function NoteTile({
  label,
  text,
  icon,
  onPress,
  testID,
}: {
  label: string;
  text: string;
  icon: IconName;
  onPress: () => void;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label} : ${text}`} testID={testID}>
      <Plate style={styles.noteTile}>
        <Icon name={icon} size={22} color={c.plateInk} />
        <View style={styles.fill}>
          <Text variant="label" color={c.plateMuted}>
            {label}
          </Text>
          <Text variant="bodyStrong" color={c.plateInk}>
            {text}
          </Text>
        </View>
        <Icon name="next" size={18} color={c.plateMuted} />
      </Plate>
    </Pressable>
  );
}

/** Deux chiffres en grand (pro : remises de la semaine, vues de la fiche). */
export function BigPair({ items }: { items: { value: number; label: string }[] }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Plate style={styles.pair} testID="home-pair">
      {items.map((i) => (
        <View key={i.label} style={styles.fill}>
          <Text variant="label" color={c.plateMuted}>
            {i.label}
          </Text>
          <Text variant="numberNarrow" color={c.plateInk}>
            {i.value.toLocaleString("fr-FR")}
          </Text>
        </View>
      ))}
    </Plate>
  );
}

/** lot 42 : la route `tuto/[profile]` existe (`true`) ; `false` masquerait la tuile. */
export const TUTO_ROUTE_READY = true;

/**
 * Tuile « Découvre ce qu'il y a de nouveau » : une fois par profil et par appareil (`kv tuto:<profil>` absent). Le kv
 * n'est posé qu'au retour du tuto : le quitter sans le voir ne le grille pas.
 */
export function TutoTile({ profile }: { profile: string }) {
  const router = useRouter();
  const { me } = useSession();
  // Réservée aux comptes existants : un compte créé avec l'arrivée a déjà vu son tuto (`mainProfile` renseigné).
  const existing = me ? me.profile.mainProfile === null : false;
  const [show, setShow] = useState(false);
  const opened = useRef(false);
  useEffect(() => {
    if (TUTO_ROUTE_READY && existing) void kvGet(`tuto:${profile}`).then((v) => setShow(v === null));
  }, [profile, existing]);
  // Retour sur l'accueil après le tuto : il est vu.
  useFocusEffect(
    useCallback(() => {
      if (!opened.current) return;
      opened.current = false;
      void kvSet(`tuto:${profile}`, "1");
      setShow(false);
    }, [profile]),
  );
  if (!TUTO_ROUTE_READY || !existing || !show) return null;
  return (
    <NoteTile
      label="Nouveau"
      text={homeProfileLabels.tutoTitle}
      icon="live"
      testID="home-tuto"
      onPress={() => {
        opened.current = true;
        router.push(`/tuto/${profile}` as never);
      }}
    />
  );
}

/** Texte de repli d'un accueil vide : une plaque en pointillés et une phrase. */
export function QuietNote({ title, body }: { title: string; body: string }) {
  const { t } = useTheme();
  return (
    <Plate kind="note" style={styles.quiet}>
      <Text variant="bodyStrong" color={t.color.plateInk}>
        {title}
      </Text>
      <Muted variant="body">{body}</Muted>
    </Plate>
  );
}

/** Le bloc météo d'un accueil : celle du jour J de l'événement, sinon celle du jour. */
export function WeatherBlock({ weather }: { weather: MyWeather | null }) {
  return (
    <>
      <SectionTitle>{homeWidgetTitles.weather}</SectionTitle>
      {weather ? (
        <WeatherWidget
          summary={weather.summary}
          attribution={weather.attribution}
          title={weather.kind === "event" ? homeProfileLabels.weatherDayJ : weatherTexts.todayTitle}
        />
      ) : (
        <Muted variant="body">{weatherTexts.unavailable}</Muted>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  greeting: { gap: space1, paddingTop: space2 },
  org: { flexDirection: "row", alignItems: "center", gap: space3 },
  orgText: { flex: 1, gap: 2 },
  orgOk: { flexDirection: "row", alignItems: "center", gap: space1 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space2 },
  mini: { gap: space1, padding: space3 },
  miniTag: { alignItems: "flex-start", marginBottom: space1 },
  row: { flexDirection: "row", alignItems: "center", gap: space3, padding: space3 },
  rowDate: { width: 52 },
  noteTile: { flexDirection: "row", alignItems: "center", gap: space3, padding: space3 },
  pair: { flexDirection: "row", gap: space3, padding: space4 },
  quiet: { gap: space2, padding: space3 },
});
