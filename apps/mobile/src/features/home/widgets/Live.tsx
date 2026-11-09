// L'Accueil pendant un événement (lot R7a2, maquette R7.4 « Pendant un événement » et R7.13) : la ligne « En cours · jour 2
// sur 4 » prend la place de « Prochaine sortie » (l'événement où j'ai ma place, qui a commencé), puis le bloc « En cours ».
//  - La story de l'organisateur est un EMPLACEMENT VIDE jusqu'au lot R7h (`organizerStory: null` : aucune vignette).
//  - Le bouton principal de l'écran est « Voter » quand un vote est ouvert ; sinon « Mon accès » (de la ligne). Un seul
//    néon : la ligne passe son « Mon accès » en bouton au trait dès qu'un vote est ouvert.
//  - Rien ici n'invente de donnée : « N sur place » n'est servi que pendant l'événement, le programme est celui du jour.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { BUSINESS_TIMEZONE, type HomeLive, homeBlockLabels } from "@orasso/shared";
import { useState } from "react";
import { type LayoutChangeEvent, StyleSheet, View } from "react-native";
import { SkewTag } from "@/features/sorties/bits";
import { formatHour } from "@/lib/format";
import { Num, SmButton } from "@/ui/Kit";
import { fitWordSize, WIDE_EM } from "../fit";
import { PosterButton } from "../NextOutings";

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

/** Un vote est-il ouvert ? Alors « Voter » est le bouton principal de l'Accueil. */
export const hasOpenVote = (live: HomeLive) => live.votes.open > 0;

export function LiveLine({
  live,
  onAccess,
  onSheet,
}: {
  live: HomeLive;
  /** « Mon accès » : `null` sans place à scanner (présence seule) ; le bouton n'existe alors pas. */
  onAccess: (() => void) | null;
  onSheet: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const [width, setWidth] = useState(0);
  const size = fitWordSize(live.event.title, width, 26, 15, WIDE_EM);
  const primaryAccess = !hasOpenVote(live);
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

export function LiveBlock({ live, onVote }: { live: HomeLive; onVote: () => void }) {
  const { t } = useTheme();
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

      {/* La story de l'organisateur (lot R7h) : emplacement vide, aucune vignette tant que `organizerStory` est `null`. */}

      {live.onSiteCount !== null ? (
        <View style={styles.onSite} testID="home-live-onsite">
          {live.onSiteCount > 0 ? <Num size={40}>{String(live.onSiteCount)}</Num> : null}
          <Text variant="bodyStrong" color={c.ink} style={styles.onSiteText}>
            {homeBlockLabels.liveOnSite(live.onSiteCount)}
          </Text>
        </View>
      ) : null}

      {open > 0 ? (
        <View style={[styles.votes, { backgroundColor: c.surfaceSunken }]} testID="home-live-votes">
          <View style={[styles.voteIcon, { backgroundColor: c.accentSoft }]}>
            <Icon name="trophy" size={22} color={c.accentText} />
          </View>
          <Text variant="bodyStrong" color={c.ink} style={styles.voteText}>
            {homeBlockLabels.liveVotes(open)}
          </Text>
          <SmKindVote onPress={onVote} />
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
