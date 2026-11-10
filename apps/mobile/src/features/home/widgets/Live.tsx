// L'Accueil pendant un événement (lot R7a2, maquette R7.4 « Pendant un événement » et R7.13) : la ligne « En cours · jour 2
// sur 4 » prend la place de « Prochaine sortie » (l'événement où j'ai ma place, qui a commencé), puis le bloc « En cours ».
//  - La story de l'organisateur (lot R7h) paraît en tête du bloc quand `organizerStory` existe : vignette 9:16 et « Story de
//    l'organisateur », qui ouvre la visionneuse de sa structure (`s:<id>`).
//  - Le bouton principal de l'écran est « Voter » quand un vote est ouvert ET que la personne peut voter (droit personnel
//    calculé par l'API : `votes.canVote`, jamais déduit de `votes.open`) ; sinon « Mon accès » (de la ligne). Un seul
//    néon : la ligne passe son « Mon accès » en bouton au trait dès que « Voter » est le bouton principal.
//  - Rien ici n'invente de donnée : « N sur place » n'est servi que pendant l'événement, le programme est celui du jour.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  BUSINESS_TIMEZONE,
  type HomeLive,
  homeBlockLabels,
  type OutingWeather,
  storyShareLabels,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { type LayoutChangeEvent, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { CrewPhotoImage } from "@/features/crews/feed/CrewPhotoImage";
import { SkewTag } from "@/features/sorties/bits";
import { formatHour } from "@/lib/format";
import { Num, SmButton } from "@/ui/Kit";
import { fitWordSize, WIDE_EM } from "../fit";
import { PosterButton, WeatherLine } from "../NextOutings";

const { space2, space3 } = tokens.spacing;

const UNTIL = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: BUSINESS_TIMEZONE,
});
const upper = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

/** « Jusqu'au mardi 10 novembre » : la fin de l'événement (dernier jour inclus). */
export const untilLine = (endsAt: string) => `Jusqu'au ${UNTIL.format(new Date(endsAt))}`;

/** Un vote est-il ouvert et puis-je voter ? Alors « Voter » est le bouton principal de l'Accueil. */
export const canVoteNow = (live: HomeLive) => live.votes.open > 0 && live.votes.canVote === true;

export function LiveLine({
  live,
  onAccess,
  onSheet,
  weather,
}: {
  live: HomeLive;
  /** « Mon accès » : `null` sans place à scanner (présence seule) ; le bouton n'existe alors pas. */
  onAccess: (() => void) | null;
  onSheet: () => void;
  /** Lot R8e1, tour 2 : la météo de l'événement, la même ligne que dans sa carte ; absente : rien. */
  weather?: OutingWeather | null;
}) {
  const { t } = useTheme();
  const c = t.color;
  const [width, setWidth] = useState(0);
  // La police système agrandie élargit les lettres : le plus long mot doit tenir quand même (un nom ne se coupe jamais).
  const { fontScale } = useWindowDimensions();
  const size = Math.max(12, Math.floor(fitWordSize(live.event.title, width, 26, 15, WIDE_EM) / Math.max(1, fontScale)));
  const primaryAccess = !canVoteNow(live);
  return (
    <View
      style={[styles.line, { backgroundColor: c.poster, boxShadow: t.shadow.shadowPoster }]}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width - 2 * space3)}
      testID="home-live-line"
    >
      <View style={styles.tag}>
        <SkewTag tone="acc" onPoster>
          {homeBlockLabels.liveEyebrow(live.dayIndex, live.dayCount).toUpperCase()}
        </SkewTag>
      </View>
      <Text
        variant="posterM"
        color={c.posterInk}
        accessibilityRole="header"
        style={{ fontSize: size, lineHeight: Math.round(size * 1.02) }}
        testID="home-live-title"
      >
        {live.event.title}
      </Text>
      {live.event.city ? (
        <View style={styles.info}>
          <Icon name="place" size={15} color={c.posterMuted} />
          <Text variant="caption" color={c.posterMuted} style={styles.infoText}>
            {live.event.city}
          </Text>
        </View>
      ) : null}
      <View style={styles.info}>
        <Icon name="calendar" size={15} color={c.posterMuted} />
        <Text variant="caption" color={c.posterMuted} style={styles.infoText}>
          {untilLine(live.event.endsAt)}
        </Text>
      </View>
      {weather ? <WeatherLine weather={weather} /> : null}
      <View style={styles.actions}>
        {onAccess ? (
          primaryAccess ? (
            <SmButton kind="p" icon="qr" onPress={onAccess} style={styles.grow} testID="home-live-access">
              Mon accès
            </SmButton>
          ) : (
            <PosterButton icon="qr" label="Mon accès" onPress={onAccess} grow={1} testID="home-live-access" />
          )
        ) : null}
        <PosterButton
          icon="next"
          label={homeBlockLabels.liveSheet}
          onPress={onSheet}
          grow={1}
          testID="home-live-sheet"
        />
      </View>
    </View>
  );
}

export function LiveBlock({
  live,
  onVote,
  offline = false,
}: {
  live: HomeLive;
  onVote: () => void;
  offline?: boolean;
}) {
  const { t } = useTheme();
  const router = useRouter();
  const c = t.color;
  const open = live.votes.open;
  const day = live.programToday;
  const hours = day ? `${formatHour(day.startsAt)} – ${formatHour(day.endsAt)}` : null;
  return (
    <View
      style={[styles.block, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
      testID="home-live-block"
    >
      <View style={styles.head}>
        <View style={[styles.dot, { backgroundColor: c.win }]} />
        <Text variant="posterM" color={c.ink} accessibilityRole="header" style={styles.headTitle}>
          {homeBlockLabels.liveTitle}
        </Text>
        <Text variant="caption" color={c.inkMuted} style={styles.headEvent}>
          {live.event.title}
        </Text>
      </View>

      {/* Données gardées sur le téléphone (réseau coupé) : pas de compteur présenté comme frais. */}
      {offline ? (
        <Text variant="caption" color={c.inkMuted} testID="home-live-offline">
          {homeBlockLabels.liveOffline}
        </Text>
      ) : null}

      {/* La story de l'organisateur (lot R7h) : tête du bloc, touchable. */}
      {live.organizerStory ? (
        <Pressable
          onPress={() => router.push(`/story/${encodeURIComponent(live.organizerStory?.structureKey ?? "")}` as never)}
          accessibilityRole="button"
          accessibilityLabel={`${storyShareLabels.organizerStoryOpen}, ${live.event.structure.name}`}
          style={[styles.story, { backgroundColor: c.surfaceRaised }]}
          testID="home-live-organizer-story"
        >
          {live.organizerStory.posterUrl ? (
            <View style={[styles.storyThumb, { borderColor: c.accent }]}>
              <CrewPhotoImage url={live.organizerStory.posterUrl} style={styles.storyImg} resizeMode="cover" />
            </View>
          ) : null}
          <View style={styles.storyText}>
            <Text variant="bodyStrong" color={c.ink}>
              {storyShareLabels.organizerStory}
            </Text>
            <Text variant="caption" color={c.inkMuted}>
              {storyShareLabels.organizerStoryHint(live.event.structure.name)}
            </Text>
          </View>
          <Icon name="next" size={18} color={c.inkMuted} />
        </Pressable>
      ) : null}

      {live.onSiteCount !== null ? (
        <View style={styles.onSite} testID="home-live-onsite">
          {live.onSiteCount > 0 ? <Num size={40}>{String(live.onSiteCount)}</Num> : null}
          <Text variant="bodyStrong" color={c.ink} style={styles.onSiteText}>
            {homeBlockLabels.liveOnSite(live.onSiteCount)}
          </Text>
        </View>
      ) : null}

      {open > 0 ? (
        // Fond et encre du MÊME thème (`surfaceSunken` est sombre dans les deux thèmes : l'encre foncée du Sable y disparaît).
        <View style={[styles.votes, { backgroundColor: c.surfaceRaised }]} testID="home-live-votes">
          <View style={[styles.voteIcon, { backgroundColor: c.accentSoft }]}>
            <Icon name="trophy" size={22} color={c.accentText} />
          </View>
          <Text variant="bodyStrong" color={c.ink} style={styles.voteText}>
            {homeBlockLabels.liveVotes(open)}
          </Text>
          {canVoteNow(live) ? <SmKindVote onPress={onVote} /> : null}
        </View>
      ) : null}

      {day ? (
        <View style={styles.program} testID="home-live-program">
          <Text variant="label" color={c.inkMuted}>
            {homeBlockLabels.liveProgram}
          </Text>
          <View style={[styles.programRow, { borderTopColor: c.line }]}>
            <Text variant="bodyStrong" color={c.ink} style={styles.programHour}>
              {hours}
            </Text>
            {day.instructions ? (
              <Text variant="body" color={c.ink} style={styles.programText}>
                {upper(day.instructions)}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Le bouton principal de l'Accueil pendant un événement : « Voter ». */
function SmKindVote({ onPress }: { onPress: () => void }) {
  return (
    <SmButton kind="p" icon="trophy" onPress={onPress} testID="home-live-vote">
      {homeBlockLabels.liveVote}
    </SmButton>
  );
}

const styles = StyleSheet.create({
  line: { padding: space3, borderRadius: 22, gap: 8 },
  story: { flexDirection: "row", alignItems: "center", gap: space3, padding: space2, borderRadius: 16 },
  storyThumb: { width: 36, height: 64, borderRadius: 8, overflow: "hidden", borderWidth: 2 },
  storyImg: { width: 32, height: 60 },
  storyText: { flex: 1, gap: 2 },
  tag: { flexDirection: "row" },
  info: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  infoText: { flex: 1, fontSize: 13, lineHeight: 17 },
  actions: { flexDirection: "row", gap: space2, marginTop: 4 },
  grow: { flex: 1, minHeight: 46, paddingHorizontal: 8 },
  block: { borderRadius: 20, padding: 14, gap: space3 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  headTitle: { fontSize: 18, lineHeight: 20 },
  headEvent: { flex: 1, textAlign: "right", fontSize: 12.5, lineHeight: 16 },
  onSite: { flexDirection: "row", alignItems: "center", gap: space3 },
  onSiteText: { flex: 1, fontSize: 15, lineHeight: 19 },
  votes: { flexDirection: "row", alignItems: "center", gap: space3, borderRadius: 14, padding: 10 },
  voteIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  voteText: { flex: 1, minWidth: 0, fontSize: 14.5, lineHeight: 18 },
  program: { gap: 6 },
  programRow: { flexDirection: "row", alignItems: "baseline", gap: space3, borderTopWidth: 1, paddingTop: 8 },
  programHour: { fontSize: 14, lineHeight: 18 },
  programText: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 19 },
});
