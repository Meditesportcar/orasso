// Blocs de l'Accueil du passionné (lot C2a, artefact DA v2 `s-home`), reproduits d'après le HTML et le CSS de
// l'artefact : intitulé de section `.sec-h`, carte météo `.wx`, mini-tickets `.stat-strip` / `.mini-t`, incitation
// `.nudge`, rail d'affiches `.rail` / `.mp`. Les cartes prennent `--card` (= jeton `surface`), rayon 16 à 18.
import { Icon, type IconName, Photo, Text, tokens, useTheme, weatherIcons } from "@orasso/design-system/native";
import {
  type EventCard,
  type HomeSponsored,
  homeLabels,
  homeProfileLabels,
  type MyWeather,
  weatherCodeLabels,
  withYear,
} from "@orasso/shared";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { mediaSource } from "@/lib/media";
import { temperatureRange } from "@/lib/weather";
import { useSecHeadStack } from "@/ui/SecHead";

const { space2, space3, space4 } = tokens.spacing;

/**
 * `.greet` : étiquette du jour, « Salut Kenji » en affiche 32 px. Lot M5 (maquette 6.1, retour 28) : plus de petites
 * flèches ‹ › à droite (on les prenait pour le passage d'une sortie à l'autre, qui se fait maintenant au doigt).
 */
export function Greet({ line, name }: { line: string; name: string }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={styles.greet} testID="home-greeting">
      <View style={styles.fill}>
        <Text variant="label" color={c.inkMuted}>
          {line}
        </Text>
        <Text variant="posterXl" color={c.ink} accessibilityRole="header" style={styles.greetTitle}>
          {homeProfileLabels.greeting(name)}
        </Text>
      </View>
    </View>
  );
}

/** `.sec-h` : titre italique large 16 px, lien moutarde « Tout voir › » à droite. */
export function SecH({
  title,
  link,
  onLink,
  meta,
  testID,
}: {
  title: string;
  link?: string;
  onLink?: () => void;
  /** Lot M5 : une mention à droite (« 1 sur 3 »), `.t-meta` de l'artefact. */
  meta?: string;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  // Lot R5b, tour 2 : la mention et le lien restent à droite ; dessous avec une police agrandie ou s'ils ne tiennent pas
  // à côté du titre (`SecHead`, `secHeadLayout`).
  const withLink = Boolean(link && onLink);
  const { onLayout, titleStyle } = useSecHeadStack({
    title,
    titleSize: 16,
    side: [meta, withLink ? link : null].filter(Boolean).join(" ") || null,
    sideSize: 13,
    sideExtra: (withLink ? 18 : 0) + (meta && withLink ? 10 : 0),
    gap: 10,
  });
  return (
    <View style={styles.secH} onLayout={onLayout} testID={testID}>
      <Text variant="posterM" color={c.ink} accessibilityRole="header" style={[styles.secTitle, titleStyle]}>
        {title}
      </Text>
      {meta ? (
        <Text variant="meta" color={c.inkMuted} testID={testID ? `${testID}-meta` : undefined}>
          {meta}
        </Text>
      ) : null}
      {link && onLink ? (
        <Pressable onPress={onLink} accessibilityRole="link" style={styles.secLink} hitSlop={10}>
          <Text variant="bodyStrong" color={c.accentText} style={styles.secLinkText}>
            {link}
          </Text>
          <Icon name="next" size={14} color={c.accentText} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** `.wx` : pastille d'icône 64 px sur `--accent-soft`, lieu et jour en gras, grand chiffre, pied en pointillés. */
export function WeatherCard({
  weather,
  place,
  when,
}: {
  weather: MyWeather;
  place: string | null;
  when: string | null;
}) {
  const { t, theme } = useTheme();
  const c = t.color;
  const s = weather.summary;
  // `--accent-soft` de l'artefact : moutarde à 16 % (Béton) ou 26 % (Sable).
  const accentSoft = `${c.accent}${theme === "sable" ? "42" : "29"}`;
  const label = weatherCodeLabels[s.code];
  // Lot R6-police : le libellé commun, « jour J » insécable (« LE JOUR / J » avec la police agrandie).
  const title = weather.kind === "event" ? homeProfileLabels.weatherDayJ : "Météo du jour";
  const line = [place, when].filter(Boolean).join(", ");
  return (
    <View
      style={[styles.card, styles.wx, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
      accessible
      accessibilityLabel={`${title} : ${line ? `${line}, ` : ""}${label}, ${temperatureRange(s)}`}
      testID="home-weather"
    >
      <View style={[styles.wxIcon, { backgroundColor: accentSoft }]}>
        <Icon name={weatherIcons[s.code]} size={34} color={c.accentText} />
      </View>
      <View style={styles.fill}>
        <Text variant="label" color={c.inkMuted}>
          {title}
        </Text>
        {line ? (
          <Text variant="bodyStrong" color={c.ink} style={styles.wxTitle}>
            {line}
          </Text>
        ) : null}
        <View style={styles.wxBig}>
          <Text variant="numberNarrow" color={c.ink} style={styles.wxNum}>
            {`${Math.round(s.tempMax)}°`}
          </Text>
          <Text variant="caption" color={c.inkMuted} style={styles.fill}>
            {label}
          </Text>
        </View>
      </View>
      <View style={[styles.wxFoot, { borderTopColor: c.line }]}>
        <View style={styles.wxFootItem}>
          <Icon name="weatherWind" size={16} color={c.inkMuted} />
          <Text variant="caption" color={c.inkMuted}>{`Vent ${Math.round(s.windMaxKmh)} km/h`}</Text>
        </View>
        {s.precipitationProbability !== null ? (
          <View style={styles.wxFootItem}>
            <Icon name="weatherRain" size={16} color={c.inkMuted} />
            <Text variant="caption" color={c.inkMuted}>{`Pluie ${Math.round(s.precipitationProbability)} %`}</Text>
          </View>
        ) : null}
        <Text variant="caption" color={c.inkMuted}>
          {weather.attribution}
        </Text>
      </View>
    </View>
  );
}

/** `.mini-t` : petit ticket (étiquette, titre italique 13 px, une ligne 12 px). */
export function MiniTicket({
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
  const c = t.color;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={title}
      testID={testID}
      style={[styles.mini, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
    >
      {tag}
      <Text variant="posterS" color={c.ink} style={styles.miniTitle}>
        {title}
      </Text>
      {caption ? (
        <Text variant="caption" color={c.inkMuted} style={styles.miniCap}>
          {caption}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** `.stat-strip` : deux colonnes égales. */
export function MiniStrip({ children }: { children: ReactNode }) {
  return <View style={styles.strip}>{children}</View>;
}

/** `.nudge` : carte d'incitation, une pastille ou des tampons à gauche ou à droite, chevron. */
export function Nudge({
  label,
  text,
  caption,
  icon,
  trailing,
  onPress,
  testID,
}: {
  label: string;
  text: string;
  caption?: string;
  icon?: IconName;
  trailing?: ReactNode;
  onPress: () => void;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} : ${text}`}
      testID={testID}
      style={[styles.nudge, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
    >
      {icon ? (
        <View style={[styles.crMini, { backgroundColor: c.ink }]}>
          <Icon name={icon} size={22} color={c.accent} />
        </View>
      ) : null}
      <View style={styles.fill}>
        <Text variant="label" color={c.inkMuted}>
          {label}
        </Text>
        <Text variant="bodyStrong" color={c.ink} style={styles.nudgeText}>
          {text}
        </Text>
        {caption ? (
          <Text variant="caption" color={c.inkMuted}>
            {caption}
          </Text>
        ) : null}
      </View>
      {trailing ?? <Icon name="next" size={20} color={c.ink} />}
    </Pressable>
  );
}

const DAY_FMT = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "Europe/Paris",
});

/** `.rail` d'affiches `.mp` (150 × 188, corps : titre italique, date · distance). */
export function PosterRail({
  events,
  onOpen,
  sponsored,
  onSponsored,
}: {
  events: (EventCard & { distanceKm?: number | null })[];
  onOpen: (slug: string) => void;
  /**
   * L'emplacement sponsorisé (lot 30, fonction validée) : une affiche du rail, en tête, marquée « Sponsorisé » (artefact :
   * plus de carte à part, audit § 5.2). L'API ne compte une impression que pour l'emplacement qu'elle renvoie à cet
   * Accueil, qui l'affiche toujours.
   */
  sponsored?: HomeSponsored | null;
  onSponsored?: (s: HomeSponsored) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
      style={styles.railOut}
      testID="home-rail"
    >
      {sponsored ? (
        <Pressable
          key={`s-${sponsored.id}`}
          onPress={() => onSponsored?.(sponsored)}
          accessibilityRole="link"
          accessibilityLabel={`${homeLabels.sponsored} : ${sponsored.title}, ${sponsored.pro.name}`}
          style={[styles.mp, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
          testID="sponsored-card"
        >
          <View style={[styles.mpArt, { backgroundColor: c.night }]}>
            {sponsored.imageUrl ? (
              <Photo
                source={mediaSource(sponsored.imageUrl)}
                style={StyleSheet.absoluteFill as never}
                accessibilityLabel=""
              />
            ) : (
              <View style={styles.mpSponsoredText}>
                <Text variant="posterS" color={c.nightInk}>
                  {sponsored.title}
                </Text>
                <Text variant="caption" color={c.nightInk} numberOfLines={4}>
                  {sponsored.body}
                </Text>
              </View>
            )}
          </View>
          {/* Lot M5 (maquette 6.2) : « ★ Sponsorisé » en tête du corps, puis le pro. */}
          <View style={styles.mpBody}>
            <View style={styles.spTag}>
              <Icon name="star" size={12} color={c.inkMuted} />
              <Text variant="label" color={c.inkMuted} style={styles.spTagText} testID="sponsored-tag">
                {homeLabels.sponsored}
              </Text>
            </View>
            <Text variant="posterS" color={c.ink} style={styles.mpTitle}>
              {sponsored.pro.name}
            </Text>
          </View>
        </Pressable>
      ) : null}
      {events.map((e) => {
        const day = withYear(DAY_FMT.format(new Date(e.startsAt)).replace(/\./g, ""), e.startsAt);
        const dist = typeof e.distanceKm === "number" ? ` · ${Math.round(e.distanceKm)} km` : "";
        return (
          <Pressable
            key={e.id}
            onPress={() => onOpen(e.slug)}
            accessibilityRole="link"
            accessibilityLabel={e.title}
            style={[styles.mp, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
            testID="home-rail-item"
          >
            <View style={[styles.mpArt, { backgroundColor: c.night }]}>
              {(e.generatedPosterUrl ?? e.posterUrl) ? (
                <Photo
                  source={mediaSource(e.generatedPosterUrl ?? e.posterUrl)}
                  style={StyleSheet.absoluteFill as never}
                  accessibilityLabel=""
                />
              ) : null}
            </View>
            <View style={styles.mpBody}>
              <Text variant="posterS" color={c.ink} style={styles.mpTitle}>
                {e.title}
              </Text>
              <Text variant="caption" color={c.inkMuted} style={styles.mpCap}>
                {`${day.charAt(0).toUpperCase()}${day.slice(1)}${dist}`}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: { borderRadius: 18, padding: space4 },
  greet: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingTop: space2 },
  greetTitle: { fontSize: 32, lineHeight: 31, marginTop: 2 },
  // Lot R5b (titres « SON ») : le titre prend la place restante (jamais un mot perdu), la mention passe dessous au besoin.
  secH: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    columnGap: 10,
    rowGap: 2,
    marginTop: space2,
  },
  secTitle: { fontSize: 16, lineHeight: 18, flexGrow: 1, flexShrink: 1 },
  secLink: { flexDirection: "row", alignItems: "center", gap: 4 },
  secLinkText: { fontSize: 13, lineHeight: 18, fontWeight: "700" },
  wx: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 14, rowGap: 4 },
  wxIcon: { width: 64, height: 64, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  wxTitle: { fontSize: 15, lineHeight: 19, fontWeight: "800", marginTop: 2 },
  wxBig: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  wxNum: { fontSize: 46, lineHeight: 44 },
  wxFoot: {
    width: "100%",
    borderTopWidth: 1,
    borderStyle: "dashed",
    paddingTop: 10,
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 16,
    rowGap: 4,
  },
  wxFootItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  strip: { flexDirection: "row", gap: 10 },
  mini: { flex: 1, borderRadius: 16, padding: space3, gap: 8 },
  miniTitle: { lineHeight: 14 },
  miniCap: { fontSize: 12, lineHeight: 16 },
  nudge: { flexDirection: "row", alignItems: "center", gap: space3, padding: 14, borderRadius: 18 },
  nudgeText: { marginTop: 4 },
  crMini: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  railOut: { marginHorizontal: -space4 },
  rail: { gap: 12, paddingHorizontal: space4, paddingTop: 4, paddingBottom: 10 },
  mp: { width: 150, borderRadius: 16, overflow: "hidden" },
  mpArt: { height: 188 },
  mpBody: { padding: 10, gap: 3 },
  mpSponsoredText: { flex: 1, padding: 10, gap: 6, justifyContent: "flex-end" },
  mpTitle: { fontSize: 12.5, lineHeight: 13 },
  spTag: { flexDirection: "row", alignItems: "center", gap: 4 },
  spTagText: { fontSize: 10.5, lineHeight: 13 },
  mpCap: { fontSize: 12, lineHeight: 16 },
});
