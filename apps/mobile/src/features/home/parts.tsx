// Pièces communes des accueils par profil (lot 43, prototype `s-home`) : la salutation, la carte du prochain événement
// (affiche en fond, compte à rebours en contour), les petites tuiles, les lignes de liste, la tuile « nouveau ».
// Un seul bouton principal par carte ; les itinéraires sont des boutons secondaires.

import {
  Button,
  Icon,
  type IconName,
  OutlinedText,
  Photo,
  Plate,
  Text,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import { type HomeOrganizer, homeProfileLabels, homeWidgetTitles, type MyWeather, weatherTexts } from "@orasso/shared";
import { useRouter } from "expo-router";
import { type ReactNode, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { barDay } from "@/features/sorties/model";
import { WeatherWidget } from "@/features/WeatherWidget";
import { type Destination, openMaps, openWaze } from "@/lib/directions";
import { formatShortDate } from "@/lib/format";
import { kvGet, kvSet } from "@/lib/kv";
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
  posterUrl: string | null;
  startsAt: string;
  /** « J-6 », « Demain », « Aujourd'hui » : en contour sur l'affiche. */
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

/** Le logo de la structure : une pastille avec ses initiales quand il n'y a pas d'image. */
export function OrganizerLine({ organizer }: { organizer: HomeOrganizer }) {
  const { t } = useTheme();
  const c = t.color;
  const initials = organizer.name
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .join("")
    .slice(0, 3)
    .toUpperCase();
  return (
    <View style={styles.org} testID="home-organizer">
      <View style={[styles.orgLogo, { backgroundColor: c.night, borderColor: c.plateLine }]}>
        {organizer.logoUrl ? (
          <Photo source={{ uri: organizer.logoUrl }} style={styles.orgImage} accessibilityLabel={organizer.name} />
        ) : (
          <Text variant="meta" color={c.nightInk}>
            {initials}
          </Text>
        )}
      </View>
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

/**
 * La carte du prochain événement : l'affiche générée en fond (dégradé s'il n'y en a pas), le jour en souche, le compte à
 * rebours et l'heure en contour, puis l'organisateur, le lieu, l'arrivée, l'accès et les itinéraires.
 */
export function HeroCard({
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
  const { t } = useTheme();
  const c = t.color;
  const day = barDay(startsAt).split(" ");
  return (
    <Plate style={styles.hero} testID={testID}>
      <View style={styles.art} testID="home-hero-art">
        <Photo
          source={posterUrl ? { uri: posterUrl } : undefined}
          placeholder={`linear-gradient(135deg, ${c.surfaceRaised} 0%, ${c.night} 100%)`}
          style={StyleSheet.absoluteFill as never}
          accessibilityLabel={posterUrl ? `Affiche : ${title}` : undefined}
        />
        <View style={[styles.date, { backgroundColor: c.night }]} testID="home-hero-date">
          <Text variant="meta" color={c.nightInk}>
            {day[0]}
          </Text>
          <Text variant="posterM" color={c.accent} style={styles.dateDay}>
            {day[1]}
          </Text>
        </View>
        <View style={styles.countdown}>
          <OutlinedText variant="posterL" on="photo" color={c.accent} testID="home-countdown">
            {countdown}
          </OutlinedText>
          <OutlinedText variant="label" on="photo" color={c.barInk} testID="home-hour">
            {hourLabel}
          </OutlinedText>
        </View>
      </View>
      <View style={styles.info}>
        {tags ? <View style={styles.tags}>{tags}</View> : null}
        <Text variant="posterL" color={c.plateInk} accessibilityRole="header">
          {title}
        </Text>
        {organizer ? <OrganizerLine organizer={organizer} /> : null}
        {meta.map((m) => (
          <View key={m.text} style={styles.metaLine}>
            <Icon name={m.icon} size={16} color={c.plateMuted} />
            <Text variant="body" color={c.plateInk} style={styles.metaText}>
              {m.text.charAt(0).toUpperCase() + m.text.slice(1)}
            </Text>
          </View>
        ))}
        <Button variant="primary" icon={action.icon} onPress={action.onPress} fullWidth testID="home-hero-action">
          {action.label}
        </Button>
        <View style={styles.gps}>
          <Button variant="plate" icon="place" onPress={() => openMaps(destination)} testID="home-maps">
            {homeProfileLabels.maps}
          </Button>
          <Button variant="plate" icon="place" onPress={() => openWaze(destination)} testID="home-waze">
            {homeProfileLabels.waze}
          </Button>
          <Button variant="plate" icon="explore" onPress={onMap} testID="home-on-map">
            {homeProfileLabels.onMap}
          </Button>
        </View>
      </View>
    </Plate>
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
          <Text variant="numberNarrow" color={c.plateInk} style={styles.bigNumber}>
            {i.value.toLocaleString("fr-FR")}
          </Text>
        </View>
      ))}
    </Plate>
  );
}

/** Tuile « Découvre ce qu'il y a de nouveau » : une fois par profil et par appareil (`kv tuto:<profil>` absent). */
export function TutoTile({ profile }: { profile: string }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  useEffect(() => {
    void kvGet(`tuto:${profile}`).then((v) => setShow(v === null));
  }, [profile]);
  if (!show) return null;
  return (
    <NoteTile
      label="Nouveau"
      text={homeProfileLabels.tutoTitle}
      icon="live"
      testID="home-tuto"
      onPress={() => {
        void kvSet(`tuto:${profile}`, "1");
        setShow(false);
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
  hero: { padding: 0, overflow: "hidden" },
  art: { height: 200, justifyContent: "flex-end", overflow: "hidden" },
  date: {
    position: "absolute",
    top: space3,
    left: space3,
    alignItems: "center",
    paddingVertical: space1,
    paddingHorizontal: space3,
    borderRadius: 8,
    transform: [{ rotate: "-4deg" }],
  },
  dateDay: { lineHeight: 26 },
  countdown: { padding: space3, gap: 0 },
  info: { gap: space3, padding: space4 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space2, alignItems: "center" },
  org: { flexDirection: "row", alignItems: "center", gap: space3 },
  orgLogo: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  orgImage: { width: 40, height: 40 },
  orgText: { flex: 1, gap: 2 },
  orgOk: { flexDirection: "row", alignItems: "center", gap: space1 },
  metaLine: { flexDirection: "row", alignItems: "center", gap: space2 },
  metaText: { flex: 1 },
  gps: { flexDirection: "row", gap: space2, flexWrap: "wrap" },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space2 },
  mini: { gap: space1, padding: space3 },
  miniTag: { alignItems: "flex-start", marginBottom: space1 },
  row: { flexDirection: "row", alignItems: "center", gap: space3, padding: space3 },
  rowDate: { width: 52 },
  noteTile: { flexDirection: "row", alignItems: "center", gap: space3, padding: space3 },
  pair: { flexDirection: "row", gap: space3, padding: space4 },
  bigNumber: { fontSize: 44, lineHeight: 48 },
  quiet: { gap: space2, padding: space3 },
});
