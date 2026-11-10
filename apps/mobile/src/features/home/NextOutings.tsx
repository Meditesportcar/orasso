// « Ta prochaine sortie » de l'Accueil (lot M5, maquette 6.1 ; artefact `.poster.nx`) : une affiche-ticket par sortie,
// qui glisse au doigt, avec des points de pagination dessous (plus de « Tes autres sorties »). En tête du ticket,
// l'affiche de l'événement en portrait (jamais la photo de la voiture, décision de Damien) ; toucher le haut du ticket
// ouvre la fiche de l'événement. Dessous : « Mon accès » (bouton principal du ticket visible) et « Sur la carte » côte à
// côte ; ni Maps ni Waze (correction de Damien : ils restent sur l'écran du QR). Le titre ne se coupe jamais au milieu
// d'un mot (retour 01) : sa taille suit le mot le plus long. Aucun filigrane ORASSO.
import {
  archivoAt,
  Icon,
  type IconName,
  NightScene,
  Photo,
  Text,
  tokens,
  useTheme,
  weatherIcons,
} from "@orasso/design-system/native";
import { BUSINESS_TIMEZONE, type OutingWeather, outingWeatherLine, withYear } from "@orasso/shared";
import { type ReactNode, useState } from "react";
import { type LayoutChangeEvent, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";

import { SmButton } from "@/features/passionne/kit";
import { mediaSource } from "@/lib/media";
import { useNow } from "@/lib/useNow";
import { fitTitle, fitWordSize, NARROW_EM } from "./fit";

const { space2, space3, space4 } = tokens.spacing;

export type OutingAction = { label: string; icon: IconName; onPress: () => void; testID?: string };

export type Outing = {
  key: string;
  title: string;
  startsAt: string;
  /** « J-6 », « Demain », « Aujourd'hui », « En cours » (lot R7-0 : jamais « J+1 » pour un événement en cours). */
  countdown: string;
  /** « Jour 2 sur 4 » sous « En cours » ; sans lui, le petit libellé est la date de début. */
  countdownDetail?: string | null;
  posterUrl: string | null;
  /** Étiquettes de statut (Retenue, Zone JDM, Billet…). */
  tags: ReactNode;
  /** Lignes d'information : arrivée, lieu, délai de la liste d'attente. */
  lines: { icon: IconName; text: string }[];
  /** Le geste du ticket : « Mon accès », « Mon billet », « Ma candidature » ; aucun pour une liste d'attente. */
  action: (OutingAction & { kind: "access" | "secondary" }) | null;
  /** Lot R8e1 : la météo de la sortie, une ligne de la carte au-dessus de « Mon accès » ; absente : la carte ne change pas. */
  weather?: OutingWeather | null;
  /** « Sur la carte » (le plan), à côté de « Mon accès ». */
  onMap: (() => void) | null;
  /** Ouvre la fiche de l'événement. */
  onOpen: () => void;
};

const DAY_FMT = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: BUSINESS_TIMEZONE,
});
const dayLabel = (iso: string) => {
  const s = withYear(DAY_FMT.format(new Date(iso)), iso);
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Largeur d'un ticket : l'écran moins le suivant qui dépasse (18 px, `.nxr>*`). */
const PEEK = 18;
const GAP = 10;
const POSTER_W = 128;

/** Bouton au trait posé sur l'affiche (`.gps` de l'artefact : filet d'encre de l'affiche à 35 % (59 en hexadécimal), capitales 12 px). */
export function PosterButton({
  icon,
  label,
  onPress,
  grow,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  grow: number;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.pb, { flex: grow, borderColor: `${c.posterInk}59` }, pressed && styles.pressed]}
    >
      <Icon name={icon} size={16} color={c.posterInk} />
      <Text variant="button" color={c.posterInk} style={styles.pbText}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Lot R8e1 (maquette R8.8 `.r8wx`) : la météo de la sortie, séparée du reste de la carte par un trait en pointillés ; pour un
 * événement « Incertain », le bandeau d'encre de l'affiche dessous.
 */
function WeatherLine({ weather }: { weather: OutingWeather }) {
  const { t } = useTheme();
  const c = t.color;
  const now = useNow();
  const line = outingWeatherLine(weather, now);
  return (
    <View style={styles.wxWrap}>
      <View
        style={[styles.wx, { borderTopColor: c.posterMuted }]}
        accessible
        accessibilityLabel={line.aria}
        testID="home-outing-weather"
      >
        <Icon name={weatherIcons[weather.summary.code]} size={26} color={c.posterInk} />
        <View style={styles.wxText}>
          <Text variant="bodyStrong" color={c.posterInk} style={styles.wxMain}>
            {line.lead}
            <Text variant="numberNarrow" color={c.posterInk} style={styles.wxMain}>
              {line.temp}
            </Text>
            {line.tail}
          </Text>
          <Text variant="caption" color={c.posterMuted} style={styles.wxSub} testID="home-outing-weather-sub">
            {line.sub}
          </Text>
        </View>
      </View>
      {line.banner ? (
        <View style={[styles.wxBanner, { backgroundColor: c.posterInk }]} testID="home-outing-weather-banner">
          <Icon name="info" size={14} color={c.poster} />
          <Text variant="caption" color={c.poster} style={styles.wxBannerText}>
            {line.banner}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Ticket({ outing, width, primary }: { outing: Outing; width: number; primary: boolean }) {
  const { t } = useTheme();
  const c = t.color;
  const [infoW, setInfoW] = useState(0);
  const onInfo = (e: LayoutChangeEvent) => setInfoW(e.nativeEvent.layout.width);
  const { fontScale } = useWindowDimensions();
  // Le titre ne se coupe qu'entre deux mots : son mot le plus large tient dans la colonne, police du système comprise.
  // Lot R7-0, tour 3 : jamais sous 11 ; si le mot le plus long ne tient pas à 11 dans la colonne, le titre passe sur toute
  // la largeur de la carte, sous l'affiche.
  const { size: titleSize, full: titleFull } = fitTitle(outing.title, infoW, width - 2 * space3, fontScale, 19);
  const cdSize = fitWordSize(outing.countdown, infoW * 0.62, 48, 24, NARROW_EM);
  const source = mediaSource(outing.posterUrl);
  const a = outing.action;
  const titleText = (
    <Text
      variant="posterM"
      color={c.posterInk}
      accessibilityRole="header"
      style={{ fontSize: titleSize, lineHeight: Math.round(titleSize * 1.02) }}
      testID="home-outing-title"
    >
      {outing.title}
    </Text>
  );
  return (
    <View
      style={[styles.nx, { width, backgroundColor: c.poster, boxShadow: t.shadow.shadowPoster }]}
      testID="home-outing"
    >
      <Pressable
        onPress={outing.onOpen}
        accessibilityRole="link"
        accessibilityLabel={`${outing.title}, ${outing.countdown}${outing.countdownDetail ? ` · ${outing.countdownDetail}` : ""}. Voir la fiche`}
        style={({ pressed }) => [styles.top, pressed && styles.pressed]}
        testID="home-outing-open"
      >
        <View style={[styles.aff, { backgroundColor: c.night }]} testID="home-outing-poster">
          {source ? (
            <Photo source={source} style={StyleSheet.absoluteFill as never} accessibilityLabel="" />
          ) : (
            <NightScene />
          )}
        </View>
        <View style={styles.info} onLayout={onInfo}>
          <View style={styles.tags}>{outing.tags}</View>
          <View style={styles.cdn}>
            <Text
              variant="numberNarrow"
              color={c.accent}
              style={[styles.cdBig, { fontSize: cdSize, lineHeight: Math.round(cdSize * 0.86) }]}
              testID="home-countdown"
            >
              {outing.countdown}
            </Text>
            <Text variant="label" color={c.posterMuted} style={styles.cdSmall}>
              {outing.countdownDetail ?? dayLabel(outing.startsAt)}
            </Text>
          </View>
          {titleFull ? null : titleText}
          {outing.lines.map((l) => (
            <View key={`${l.icon}-${l.text}`} style={styles.line}>
              <Icon name={l.icon} size={14} color={c.posterMuted} />
              <Text variant="caption" color={c.posterMuted} style={styles.lineText}>
                {l.text}
              </Text>
            </View>
          ))}
          <View style={styles.go}>
            <Text variant="bodyStrong" color={c.accent} style={styles.goText}>
              Voir la fiche
            </Text>
            <Icon name="next" size={14} color={c.accent} />
          </View>
        </View>
      </Pressable>
      {titleFull ? (
        <Pressable
          onPress={outing.onOpen}
          accessibilityRole="link"
          accessibilityLabel={`${outing.title} : voir la fiche`}
          testID="home-outing-title-wide"
        >
          {titleText}
        </Pressable>
      ) : null}
      {outing.weather ? <WeatherLine weather={outing.weather} /> : null}
      {a || outing.onMap ? (
        <View style={styles.actions}>
          {a && a.kind === "access" && primary ? (
            <SmButton kind="p" icon={a.icon} onPress={a.onPress} style={styles.access} testID={a.testID}>
              {a.label}
            </SmButton>
          ) : a ? (
            <PosterButton icon={a.icon} label={a.label} onPress={a.onPress} grow={1} testID={a.testID} />
          ) : null}
          {outing.onMap ? (
            <PosterButton icon="map" label="Sur la carte" onPress={outing.onMap} grow={1} testID="home-on-map" />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Les tickets qui glissent, et leurs points. Le ticket visible porte le seul bouton principal de l'écran. */
export function NextOutings({
  outings,
  header,
}: {
  outings: Outing[];
  /** L'intitulé de la section, avec « 1 sur 3 » (la page visible). */
  header?: (page: number, count: number) => ReactNode;
}) {
  const { t } = useTheme();
  const c = t.color;
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const single = outings.length < 2;
  const itemW = single ? width : Math.max(0, width - PEEK);
  const step = itemW + GAP;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.wrap} testID="home-outings">
      {header?.(page, outings.length)}
      {width > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEnabled={!single}
          snapToInterval={single ? undefined : step}
          snapToAlignment="start"
          decelerationRate="fast"
          scrollEventThrottle={32}
          onScroll={(e) => {
            const next = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, step));
            const clamped = Math.max(0, Math.min(outings.length - 1, next));
            if (clamped !== page) setPage(clamped);
          }}
          style={styles.railOut}
          contentContainerStyle={styles.rail}
          testID="home-outings-rail"
        >
          {outings.map((o, i) => (
            <Ticket key={o.key} outing={o} width={itemW} primary={i === page} />
          ))}
        </ScrollView>
      ) : null}
      {!single ? (
        <View
          style={styles.dots}
          accessibilityLabel={`Sortie ${page + 1} sur ${outings.length}`}
          testID="home-outings-dots"
        >
          {outings.map((o, i) => (
            <View
              key={o.key}
              style={[
                styles.dot,
                i === page ? [styles.dotOn, { backgroundColor: c.accent }] : { backgroundColor: c.line },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Le rail déborde des marges de l'écran (`.nxr` : marge négative, padding 16) pour que le ticket suivant dépasse.
  wrap: { gap: space3 },
  railOut: { marginHorizontal: -space4 },
  rail: { gap: GAP, paddingHorizontal: space4, paddingTop: 4, paddingBottom: 6 },
  nx: { padding: space3, borderRadius: 22, gap: space3 },
  top: { flexDirection: "row", gap: space3, alignItems: "flex-start" },
  pressed: { opacity: 0.85 },
  aff: { width: POSTER_W, aspectRatio: 4 / 5, borderRadius: 12, overflow: "hidden" },
  info: { flex: 1, minWidth: 0, gap: 6, alignSelf: "stretch" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  cdn: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: 6 },
  cdBig: { fontFamily: archivoAt(62, 800) },
  cdSmall: { fontSize: 11, lineHeight: 14 },
  line: { flexDirection: "row", alignItems: "flex-start", gap: 5 },
  lineText: { flex: 1, fontSize: 12.5, lineHeight: 16 },
  go: { marginTop: "auto", flexDirection: "row", alignItems: "center", gap: 4 },
  goText: { fontSize: 12, lineHeight: 16, fontWeight: "800" },
  wxWrap: { gap: space2 },
  wx: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 8,
    borderTopWidth: 1.5,
    borderStyle: "dashed",
  },
  wxText: { flex: 1, minWidth: 0 },
  wxMain: { fontSize: 15, lineHeight: 20, fontWeight: "800" },
  wxSub: { fontSize: 12, lineHeight: 16 },
  wxBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  wxBannerText: { flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 17, fontWeight: "700" },
  actions: { flexDirection: "row", gap: space2 },
  access: { flex: 1, minHeight: 46, paddingHorizontal: 8 },
  pb: {
    minHeight: 46,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  pbText: { fontSize: 11.5, lineHeight: 14, letterSpacing: 0, textAlign: "center", flexShrink: 1 },
  grow: { flex: 1 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: -2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotOn: { width: 22 },
});
