// PosterHero : la carte affiche du prochain événement (`.poster.hn` de l'artefact DA v2, lot C1, écart R5 de l'audit).
// En tête, la photo pleine largeur (210 px) qui fond vers la couleur de l'affiche ; le pavé de date moutarde incliné
// (chiffre Archivo 62 % 800 44 px) ; le compte à rebours « J-6 » (62 % 800 54 px, crème cerné de noir) en haut à
// droite ; puis le bloc d'informations remonte de 34 px sur la photo : étiquettes, titre, organisateur (logo rond),
// lieu et horaires, le bouton principal, la rangée d'itinéraires (`.gpsrow` 1fr 1fr 1,25fr) et le crédit « Orasso ».
// Sans photo : l'affiche générée entière sur la scène de nuit, sinon la scène seule (`carPhoto` de l'artefact) ; jamais
// un dégradé vide. La photo vient de l'API (lot C5, `photoUrl`).

import type { ReactNode } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import type { IconName } from "../icons";
import { initialsOf } from "../initials";
import { Button } from "./Button";
import { withAlpha } from "./color";
import { archivoAt } from "./fontFamily";
import { GradientFill } from "./Gradient";
import { Icon } from "./Icon";
import { OutlinedText } from "./OutlinedText";
import { Text } from "./text";
import { radius, useTheme } from "./theme";

/** La scène de nuit de l'artefact (ciel, lueur moutarde, sol mouillé, coupé) : le repli d'une carte sans photo. */
export function NightScene() {
  const { t } = useTheme();
  const c = t.color;
  const body =
    "M10 78C12 66 22 60 40 57L88 52C104 38 124 30 150 29C176 28 196 32 214 44L240 52C262 55 280 60 288 70L290 82C290 86 287 88 283 88H250A22 22 0 0 0 206 88H96A22 22 0 0 0 52 88H18C13 88 10 85 10 80Z";
  const wins = "M100 52C112 40 128 35 148 34L150 52ZM156 34C176 34 192 38 206 49L156 52Z";
  const car = (y: number, opacity: number, flip: boolean) => (
    <G transform={`translate(50 ${y})${flip ? " scale(1 -1)" : ""}`} opacity={opacity}>
      <Ellipse cx={150} cy={90} rx={150} ry={9} fill={c.sceneWheel} opacity={0.5} />
      <Path d={body} fill={c.sceneCar} />
      <Path d={wins} fill={c.sceneWindow} opacity={0.9} />
      <Circle cx={74} cy={88} r={19} fill={c.sceneWheel} />
      <Circle cx={228} cy={88} r={19} fill={c.sceneWheel} />
      <Circle cx={74} cy={88} r={10} fill="none" stroke={c.sceneRim} strokeWidth={3} />
      <Circle cx={228} cy={88} r={10} fill="none" stroke={c.sceneRim} strokeWidth={3} />
    </G>
  );
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} aria-hidden>
      <Svg width="100%" height="100%" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="hn-sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={c.sceneSkyTop} />
            <Stop offset="1" stopColor={c.sceneSkyBottom} />
          </LinearGradient>
          <RadialGradient id="hn-glow" cx="360" cy="20" r="160" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={c.accent} stopOpacity={0.55} />
            <Stop offset="1" stopColor={c.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={400} height={300} fill="url(#hn-sky)" />
        <Circle cx={360} cy={20} r={160} fill="url(#hn-glow)" />
        <Rect x={0} y={180} width={400} height={120} fill={c.sceneGround} />
        {car(118, 1, false)}
        {car(330, 0.22, true)}
      </Svg>
    </View>
  );
}

export type OrgLogoProps = {
  name: string;
  logoUrl?: string | null;
  /** Côté du logo (34 dans la carte d'Accueil, 36 par défaut : `.orglogo`). */
  size?: number;
  /** Surface sur laquelle il est posé : sur l'affiche, le repli prend l'encre de l'affiche. */
  on?: "card" | "poster";
};

/**
 * Le logo d'une structure : rond quand il y a une image (`.msc-l` de l'artefact), sinon le repli `.orglogo` : carré
 * à coins de 10 px, trois initiales moutarde (Archivo 70 % 900) sur l'encre de la surface.
 */
export function OrgLogo({ name, logoUrl, size = 36, on = "card" }: OrgLogoProps) {
  const { t } = useTheme();
  const c = t.color;
  if (logoUrl) {
    return (
      <View
        style={[
          styles.orgRound,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: c.night, borderColor: c.barShellEdge },
        ]}
        testID="org-logo"
      >
        <Image source={{ uri: logoUrl }} style={styles.orgImage} accessibilityLabel={name} />
      </View>
    );
  }
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={name}
      testID="org-logo-initials"
      style={[
        styles.orgFallback,
        { width: size, height: size, backgroundColor: on === "poster" ? c.posterInk : c.ink },
      ]}
    >
      <Text variant="body" style={[styles.orgInitials, { color: c.accent, fontSize: Math.round(size * 0.36) }]}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}

/** Une étiquette inclinée (`.tag` de l'artefact) : 22 px, −8°, Archivo 80 % 800 11 px. */
export function Tag({
  children,
  tone = "ink",
  on = "card",
  testID,
}: {
  children: string;
  /** `acc` : moutarde ; `line` : contour ; `ink` : encre pleine. */
  tone?: "ink" | "acc" | "line";
  on?: "card" | "poster";
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  const ink = on === "poster" ? c.posterInk : c.ink;
  const paper = on === "poster" ? c.poster : c.ground;
  const bg = tone === "acc" ? c.accent : tone === "line" ? "transparent" : ink;
  const fg = tone === "acc" ? c.accentInk : tone === "line" ? ink : paper;
  return (
    <View
      testID={testID}
      style={[
        styles.tag,
        { backgroundColor: bg, transform: [{ skewX: "-8deg" }] },
        tone === "line" && { borderWidth: 1.5, borderColor: ink },
      ]}
    >
      <Text variant="body" style={[styles.tagText, { color: fg, transform: [{ skewX: "8deg" }] }]}>
        {children}
      </Text>
    </View>
  );
}

export type PosterHeroProps = {
  /** Photo de l'événement (lot C5). */
  photoUrl?: string | null;
  /** Affiche générée : repli entier sur la scène de nuit quand il n'y a pas de photo. */
  posterUrl?: string | null;
  /** Pavé de date : « Sam. », « 24 », « Oct. ». */
  weekday: string;
  day: string;
  month: string;
  /** Lot R3b : « 2027 » sous le mois, hors de l'année en cours. */
  year?: string | null;
  /** « J-6 », « Demain », « Aujourd'hui ». */
  countdown: string;
  /** « 19 h · ouverture ». */
  hourLabel: string;
  title: string;
  /** Étiquettes (`Tag on="poster"`) au-dessus du titre. */
  tags?: ReactNode;
  organizer?: { name: string; logoUrl: string | null; subtitle?: string | null; verified?: boolean } | null;
  /** Lignes d'information : lieu, arrivée… */
  meta?: { icon: IconName; text: string }[];
  /** Le bouton principal de l'écran. */
  action?: { label: string; icon: IconName; onPress: () => void; testID?: string };
  /** Rangée d'itinéraires (Maps, Waze, Sur la carte). */
  gps?: { label: string; icon: IconName; onPress: () => void; testID?: string }[];
  testID?: string;
  /** Identifiants du compte à rebours et de l'heure (par défaut `<testID>-countdown`, `<testID>-hour`). */
  countdownTestID?: string;
  hourTestID?: string;
};

export function PosterHero({
  photoUrl,
  posterUrl,
  weekday,
  day,
  month,
  year,
  countdown,
  hourLabel,
  title,
  tags,
  organizer,
  meta = [],
  action,
  gps = [],
  testID = "poster-hero",
  countdownTestID = `${testID}-countdown`,
  hourTestID = `${testID}-hour`,
}: PosterHeroProps) {
  const { t } = useTheme();
  const c = t.color;
  const art = photoUrl ?? null;
  return (
    <View style={[styles.poster, { backgroundColor: c.poster, boxShadow: t.shadow.shadowPoster }]} testID={testID}>
      <View style={styles.art} testID={`${testID}-art`}>
        {art ? (
          <Image source={{ uri: art }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel={title} />
        ) : (
          <>
            <NightScene />
            {posterUrl ? (
              <Image
                source={{ uri: posterUrl }}
                style={StyleSheet.absoluteFill}
                resizeMode="contain"
                accessibilityLabel={`Affiche : ${title}`}
                testID={`${testID}-poster`}
              />
            ) : null}
          </>
        )}
        {/* `.hn-art::after` : la photo fond vers la couleur de l'affiche. */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <GradientFill css={`linear-gradient(180deg, transparent 40%, ${c.poster} 98%)`} />
        </View>
        <View style={[styles.date, { backgroundColor: c.accent }]} testID={`${testID}-date`}>
          <Text variant="body" style={[styles.dateSmall, { color: c.accentInk }]}>
            {weekday}
          </Text>
          <Text variant="body" style={[styles.dateDay, { color: c.accentInk }]}>
            {day}
          </Text>
          <Text variant="body" style={[styles.dateSmall, { color: c.accentInk }]}>
            {month}
          </Text>
          {year ? (
            <Text variant="body" style={[styles.dateSmall, { color: c.accentInk }]}>
              {year}
            </Text>
          ) : null}
        </View>
        <View style={styles.countdown}>
          <OutlinedText
            variant="posterL"
            on="photo"
            width={5}
            color={c.photoInk}
            style={styles.cdBig}
            containerStyle={styles.cdWrap}
            testID={countdownTestID}
          >
            {countdown}
          </OutlinedText>
          <OutlinedText
            variant="label"
            on="photo"
            width={3.5}
            color={c.photoInk}
            style={styles.cdSmall}
            containerStyle={styles.cdWrap}
            testID={hourTestID}
          >
            {hourLabel}
          </OutlinedText>
        </View>
      </View>
      <View style={styles.info}>
        {tags ? <View style={styles.tags}>{tags}</View> : null}
        <Text variant="posterL" color={c.posterInk} style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {organizer ? (
          <View style={styles.org} testID={`${testID}-organizer`}>
            <OrgLogo name={organizer.name} logoUrl={organizer.logoUrl} size={34} on="poster" />
            <View style={styles.orgText}>
              <Text variant="body" style={[styles.orgName, { color: c.posterInk }]}>
                {organizer.name}
              </Text>
              {organizer.subtitle ? (
                <View style={styles.orgSub}>
                  {organizer.verified ? <Icon name="badge" size={15} color={c.posterInk} /> : null}
                  <Text variant="body" style={[styles.orgSubText, { color: c.posterInk }]}>
                    {organizer.subtitle}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}
        {meta.length ? (
          <View style={styles.meta}>
            {meta.map((m) => (
              <View key={m.text} style={styles.metaItem}>
                <Icon name={m.icon} size={16} color={c.posterMuted} />
                <Text variant="body" style={[styles.metaText, { color: c.posterMuted }]}>
                  {m.text}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {action ? (
          <Button variant="primary" icon={action.icon} onPress={action.onPress} fullWidth testID={action.testID}>
            {action.label}
          </Button>
        ) : null}
        {gps.length ? (
          <View style={styles.gpsRow}>
            {gps.map((g, i) => (
              <Pressable
                key={g.label}
                accessibilityRole="button"
                accessibilityLabel={g.label}
                onPress={g.onPress}
                testID={g.testID}
                style={[
                  styles.gps,
                  {
                    flex: i === gps.length - 1 && gps.length === 3 ? 1.25 : 1,
                    borderColor: withAlpha(c.posterInk, 0.35),
                  },
                ]}
              >
                <Icon name={g.icon} size={16} color={c.posterInk} />
                {/* Aucun libellé coupé (D33) : il passe à la ligne s'il ne tient pas (360 px). */}
                <Text variant="body" style={[styles.gpsText, { color: c.posterInk }]}>
                  {g.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      <Text variant="body" style={[styles.credit, { color: c.posterInk }]}>
        Orasso
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  poster: { borderRadius: radius.radiusLg, overflow: "hidden", position: "relative" },
  art: { height: 210, position: "relative", overflow: "hidden" },
  date: {
    position: "absolute",
    left: 14,
    top: 12,
    zIndex: 2,
    alignItems: "center",
    borderRadius: 10,
    paddingTop: 6,
    paddingHorizontal: 10,
    paddingBottom: 4,
    transform: [{ skewX: "-8deg" }],
  },
  dateSmall: {
    fontFamily: archivoAt(75, 800),
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    transform: [{ skewX: "8deg" }],
  },
  dateDay: { fontFamily: archivoAt(62, 800), fontSize: 44, lineHeight: 40, transform: [{ skewX: "8deg" }] },
  countdown: { position: "absolute", right: 14, top: 14, zIndex: 2, alignItems: "flex-end" },
  // Le contour noir de l'artefact (-webkit-text-stroke 5 px et 3,5 px) : `OutlinedText` sur photo.
  cdWrap: { alignSelf: "flex-end" },
  cdBig: { fontFamily: archivoAt(62, 800), fontSize: 54, lineHeight: 46, letterSpacing: -0.5 },
  cdSmall: { marginTop: 3, fontFamily: archivoAt(75, 700), fontSize: 11, lineHeight: 13, letterSpacing: 1.1 },
  info: { paddingHorizontal: 16, paddingBottom: 16, marginTop: -34, zIndex: 2, gap: 10 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  title: { fontSize: 30, lineHeight: 29 },
  org: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: -2 },
  orgText: { flex: 1, minWidth: 0 },
  orgName: { fontFamily: archivoAt(100, 800), fontSize: 14, lineHeight: 18 },
  orgSub: { flexDirection: "row", alignItems: "center", gap: 5, opacity: 0.75 },
  orgSubText: { fontFamily: archivoAt(100, 600), fontSize: 11.5, lineHeight: 15 },
  meta: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 6 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontFamily: archivoAt(100, 400), fontSize: 13.5, lineHeight: 18 },
  gpsRow: { flexDirection: "row", gap: 8 },
  gps: {
    minHeight: 46,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  gpsText: {
    flexShrink: 1,
    textAlign: "center",
    fontFamily: archivoAt(110, 850),
    fontSize: 12,
    lineHeight: 13,
    letterSpacing: 0.24,
    textTransform: "uppercase",
  },
  credit: {
    position: "absolute",
    right: 12,
    bottom: 8,
    opacity: 0.75,
    fontFamily: archivoAt(75, 700),
    fontSize: 9,
    letterSpacing: 1.26,
    textTransform: "uppercase",
  },
  orgRound: { overflow: "hidden", borderWidth: 1 },
  orgImage: { width: "100%", height: "100%" },
  orgFallback: { borderRadius: 10, alignItems: "center", justifyContent: "center" },
  orgInitials: { fontFamily: archivoAt(70, 900), letterSpacing: 0.26 },
  // Lot R6-police (« GRATUIT », « YOUNGTIMER » rognés en bas, police du système agrandie) : hauteur minimale au lieu
  // d'une hauteur fixe, et un interligne à la mesure du corps (celui du texte courant, 22 px, débordait d'une étiquette
  // de 22 px dès que la police grandissait). À l'échelle 1, l'étiquette garde ses 22 px et le texte reste centré.
  tag: { minHeight: 22, paddingHorizontal: 9, borderRadius: 4, justifyContent: "center", alignSelf: "flex-start" },
  tagText: {
    fontFamily: archivoAt(80, 800),
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.66,
    textTransform: "uppercase",
  },
});
