// Un vote (lot R7l3, maquette R7.17 `v-pass` › `vs_rup` et `vs_post`, R7.18 › `vr_res`), refonte du prix du public (lots 50, C2b,
// R7-0) : la grille des candidats d'un vote à thème ou de « Toutes catégories » (on choisit une voiture, puis « Voter pour … » :
// une voix, modifiable jusqu'à la clôture, jamais pour soi), un candidat pas encore entré grisé (« Pas encore entrée »), puis
// le classement. **Le classement n'est montré qu'après la voix** (ou à tous après la clôture, ou à l'équipe) : l'écran affiche
// ce que l'API a servi, jamais un classement qu'elle a retenu (`ranking: null`, raison `vote_first` ou `not_closed`).
// Qui ne peut pas voter voit la grille et ce qu'il lui manque. Ouvert par `/vote/<événement>?vote=<vote>` ; sans `vote`, c'est
// « Toutes catégories » (anciens liens, notifications et récaps), ou la liste s'il n'existe plus.
import { Icon, Photo, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  audiencePrizeTexts,
  myRankIn,
  rankingBarPercent,
  rankingHiddenLine,
  votePassTexts as T,
  VOTE_CLOSING_SOON_MIN,
  type VoteCandidate,
  type VoteRankingEntry,
  type VoteView,
  voteBlockedLine,
  voteMinutesLeft,
  voteResultCard,
  voteScreenMode,
  voteScreenTexts,
} from "@orasso/shared";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";

import { Num, PosterSurface, SmButton } from "@/features/passionne/kit";
import { api } from "@/lib/api";
import { now as orassoNow } from "@/lib/clock";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";
import { gridOrder } from "./grid";
import { useEventRef, useVote } from "./useVote";

const { space1, space2, space3 } = tokens.spacing;

export function VoteScreen() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { id: ref, vote: voteParam, titre } = useLocalSearchParams<{ id: string; vote?: string; titre?: string }>();
  const event = useEventRef(ref);
  const eventId = event.eventId;
  const at = useNow(30_000);

  // Sans `vote` dans l'adresse : « Toutes catégories » de l'événement (anciens liens), ou la liste si ce vote a été retiré.
  const fallback = useApi(() => api.voteList(eventId as string), [eventId], {
    enabled: Boolean(eventId) && !voteParam,
  });
  const allCategories = fallback.data?.items.find((v) => v.kind === "all_categories")?.id ?? null;
  const voteId = voteParam ?? allCategories;
  useEffect(() => {
    if (!voteParam && fallback.data && !allCategories && eventId) router.replace(`/votes/${eventId}` as never);
  }, [voteParam, fallback.data, allCategories, eventId, router]);

  const { view, grid, reload } = useVote(eventId, voteId);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // La voiture choisie dans la grille (avant le vote), et la grille rouverte pour changer son vote.
  const [pick, setPick] = useState<VoteCandidate | null>(null);
  const [changing, setChanging] = useState(false);

  const data = view.data;
  const mode = voteScreenMode(data, changing);
  const eventTitle = titre || event.title || null;

  const cast = useCallback(
    async (entry: VoteCandidate) => {
      if (!eventId || !voteId) return;
      setBusy(entry.applicationId);
      setError(null);
      try {
        // La réponse porte déjà le classement que j'ai maintenant le droit de voir (j'ai voté).
        const next = await api.voteCast(eventId, voteId, entry.applicationId);
        view.setData(next);
        void view.reload();
        setSaved(true);
        setPick(null);
        setChanging(false);
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(null);
      }
    },
    [eventId, voteId, view],
  );

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace(eventId ? (`/votes/${eventId}` as never) : "/acces");
  };
  const failed = Boolean(view.error || fallback.error || event.error) && !data;
  // « Réessayer » : d'abord l'événement (adresse d'une notification ouverte hors ligne), puis ce qui en dépend.
  const retry = async () => {
    if (event.error) await event.reload();
    await Promise.all([reload(), fallback.reload()]);
  };

  const closesAt = data ? new Date(data.closesAt) : null;
  const left = data && data.state === "open" ? voteMinutesLeft(data.closesAt, at) : null;
  const untilText =
    data && data.state === "open" && closesAt ? audiencePrizeTexts.openUntil(closesAt, orassoNow()) : null;
  const interactive = mode === "choose";
  const rankingServed = data?.ranking != null && !(mode === "choose" && changing);
  const podium = data ? voteResultCard(data) : null;

  return (
    <FlowScreen
      title={data?.title ?? T.voteScreenTitle}
      facts={eventTitle || undefined}
      onClose={close}
      footer={
        interactive ? (
          <SmButton
            kind="p"
            big
            wide
            icon="trophy"
            disabled={!pick || busy !== null}
            onPress={() => pick && void cast(pick)}
            testID="vote-cta"
          >
            {pick ? T.pickCta(pick.vehicleLabel) : T.chooseCta}
          </SmButton>
        ) : undefined
      }
      onRefresh={async () => {
        await reload();
      }}
    >
      {failed ? (
        <>
          <Notice tone="error" testID="vote-ranking-failed">
            {T.loadFailed}
          </Notice>
          <SmButton kind="s" icon="undo" onPress={retry} testID="vote-ranking-retry">
            {T.retry}
          </SmButton>
        </>
      ) : null}
      {view.error && data ? (
        <>
          <Notice tone="error" testID="vote-ranking-failed">
            {T.refreshFailed}
          </Notice>
          <SmButton kind="s" icon="undo" onPress={retry} testID="vote-ranking-retry">
            {T.retry}
          </SmButton>
        </>
      ) : null}
      {!data && !failed ? <Muted variant="body">{T.loading}</Muted> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {mode === "upcoming" && data ? (
        <Notice testID="vote-upcoming">
          {data.opensAt && new Date(data.opensAt) > at ? T.notOpen : `${T.notOpen} ${T.opensWhenTwoCars}.`}
        </Notice>
      ) : null}
      {mode === "blocked" && data ? <Notice testID="vote-blocked">{voteBlockedLine(data)}</Notice> : null}
      {mode === "closed" ? <Notice testID="vote-closed">{T.closedNote}</Notice> : null}

      {mode === "voted" && data && !changing ? (
        <>
          {saved && closesAt ? (
            <Notice testID="vote-saved">{voteScreenTexts.saved(closesAt, orassoNow())}</Notice>
          ) : null}
          <SmButton kind="s" icon="undo" onPress={() => setChanging(true)} testID="vote-change">
            {T.change}
          </SmButton>
        </>
      ) : null}

      {mode === "choose" && changing ? (
        <SmButton
          kind="g"
          icon="back"
          onPress={() => {
            setPick(null);
            setChanging(false);
          }}
          testID="vote-back"
        >
          {T.backToRanking}
        </SmButton>
      ) : null}

      {mode === "choose" && data ? (
        <PosterSurface style={styles.poster} testID="vote-poster">
          {data.checkedInAt ? (
            <Text variant="label" color={c.posterMuted}>
              {audiencePrizeTexts.checkedInAt(new Date(data.checkedInAt))}
            </Text>
          ) : null}
          <Text variant="posterL" color={c.posterInk} style={styles.oneVote}>
            {T.oneVote}
          </Text>
          <Text variant="caption" color={c.posterMuted}>
            {T.rulesLine}
          </Text>
          {untilText ? (
            <Text variant="caption" color={c.posterMuted} testID="vote-open-until">
              {left !== null && left <= VOTE_CLOSING_SOON_MIN ? `${T.minutesLeft(left)} · ${untilText}` : untilText}
            </Text>
          ) : null}
        </PosterSurface>
      ) : null}

      {data && (mode === "choose" || mode === "blocked" || mode === "upcoming") && grid.error && !grid.data ? (
        <>
          <Notice tone="error" testID="vote-grid-failed">
            {T.gridLoadFailed}
          </Notice>
          <SmButton kind="s" icon="undo" onPress={() => void grid.reload()} testID="vote-grid-retry">
            {T.retry}
          </SmButton>
        </>
      ) : data && (mode === "choose" || mode === "blocked" || mode === "upcoming") ? (
        <Grid
          entries={gridOrder(grid.data ?? [])}
          ownIds={data.ownApplicationIds}
          myVote={data.myVote}
          pick={pick?.applicationId ?? null}
          busy={busy}
          interactive={interactive}
          loading={!grid.data && !grid.error}
          onPick={setPick}
        />
      ) : null}

      {/* Le classement n'est pas servi : la phrase qui dit quand il le sera (raison de l'API, jamais déduite ici). */}
      {data && data.ranking === null && mode !== "closed" && mode !== "loading" ? (
        <Muted variant="body" testID="vote-ranking-hidden">
          {rankingHiddenLine(data)}
        </Muted>
      ) : null}

      {data && mode === "closed" && podium?.[0] && data.ranking?.[0] ? (
        <WinnerCard entry={data.ranking[0]} total={data.total} />
      ) : null}
      {data && mode === "closed" && !podium && data.ranking ? (
        <Muted variant="caption" testID="vote-no-podium">
          {T.noPodium}
        </Muted>
      ) : null}

      {data && rankingServed && data.ranking ? (
        <Ranking view={data} entries={data.ranking} closed={mode === "closed"} winner={podium?.[0]?.rank === 1} />
      ) : null}
    </FlowScreen>
  );
}

function Grid({
  entries,
  ownIds,
  myVote,
  pick,
  busy,
  interactive,
  loading,
  onPick,
}: {
  entries: VoteCandidate[];
  ownIds: readonly string[];
  myVote: string | null;
  pick: string | null;
  busy: string | null;
  interactive: boolean;
  loading: boolean;
  onPick: (entry: VoteCandidate) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  if (loading) return <Muted variant="body">{T.loading}</Muted>;
  if (entries.length === 0) return <Muted variant="body">{T.empty}</Muted>;
  return (
    <View style={styles.grid} testID="vote-grid">
      {entries.map((e, i) => {
        const own = ownIds.includes(e.applicationId);
        const waiting = !e.eligible;
        const chosen = pick === e.applicationId || (pick === null && myVote === e.applicationId);
        const off = own || waiting || !interactive || busy !== null;
        return (
          <Pressable
            key={e.applicationId}
            testID={own ? "vote-card-own" : waiting ? "vote-card-waiting" : interactive ? "vote-card" : "vote-card-off"}
            accessibilityRole="button"
            accessibilityLabel={
              own
                ? `${e.vehicleLabel}. ${T.you}`
                : waiting
                  ? `${e.vehicleLabel}. ${T.notYetEntered}`
                  : voteScreenTexts.pick(e.vehicleLabel)
            }
            accessibilityState={{ disabled: off, selected: chosen }}
            disabled={off}
            onPress={() => onPick(e)}
            style={[
              styles.card,
              {
                backgroundColor: c.surface,
                boxShadow: chosen ? `0 0 0 3px ${c.accent}, ${t.shadow.shadowCard}` : t.shadow.shadowCard,
              },
              chosen && styles.cardOn,
              waiting && styles.waiting,
            ]}
          >
            <View style={styles.photo}>
              <Photo
                source={mediaSource(e.photoUrl)}
                placeholder={`linear-gradient(135deg, ${c.surfaceRaised} 0%, ${c.night} 100%)`}
                style={StyleSheet.absoluteFill}
              />
              {own || waiting ? <View style={[StyleSheet.absoluteFill, { backgroundColor: `${c.night}8c` }]} /> : null}
              <View style={styles.tag}>
                {/* « Toi » et « Pas encore entrée » sont posés sur le voile sombre de la photo : un fond nuit et l'encre crème de la nuit,
                    les mêmes dans les deux thèmes (l'encre du thème est sombre en Sable, celle de l'affiche l'est en Béton : invisibles). */}
                {own || waiting ? (
                  <View
                    style={[styles.veilBadge, { backgroundColor: c.night, borderColor: c.nightInk }]}
                    testID="vote-card-badge"
                  >
                    <Text variant="label" color={c.nightInk} style={styles.veilBadgeText}>
                      {own ? T.youTag : T.notYetEntered}
                    </Text>
                  </View>
                ) : (
                  <Tag tone="ink" on="card">
                    {T.number(i + 1)}
                  </Tag>
                )}
              </View>
              {chosen ? (
                <View style={[styles.check, { backgroundColor: c.accent }]}>
                  <Icon name="check" size={16} color={c.accentInk} />
                </View>
              ) : null}
            </View>
            <View style={styles.cardBody}>
              <Text variant="posterS" color={own || waiting ? c.inkMuted : c.ink} style={styles.cardName}>
                {e.vehicleLabel}
              </Text>
              <Text variant="caption" color={c.inkMuted} style={styles.cardSub}>
                {own ? T.you : chosen && myVote === e.applicationId ? T.yourVote : waiting ? T.notYetEntered : e.pseudo}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Le gagnant d'un vote clos (maquette `vr_res`) : la photo, « Gagnante · 19 voix sur 52 », le nom et le pseudo. */
function WinnerCard({ entry, total }: { entry: VoteRankingEntry; total: number }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <PosterSurface style={styles.winner} testID="vote-winner">
      <View style={styles.winnerPhoto}>
        <Photo
          source={mediaSource(entry.photoUrl)}
          placeholder={`linear-gradient(135deg, ${c.surfaceRaised} 0%, ${c.night} 100%)`}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <View style={styles.winnerText}>
        <Text variant="label" color={c.posterMuted}>
          {T.winnerLine(entry.votes, total).toUpperCase()}
        </Text>
        <Text variant="posterS" color={c.posterInk} style={styles.winnerName}>
          {entry.vehicleLabel}
        </Text>
        <Text variant="caption" color={c.posterMuted}>
          {entry.pseudo}
        </Text>
      </View>
    </PosterSurface>
  );
}

function Ranking({
  view,
  entries,
  closed,
  winner,
}: {
  view: VoteView;
  entries: VoteRankingEntry[];
  closed: boolean;
  winner: boolean;
}) {
  const { t } = useTheme();
  const c = t.color;
  const top = entries[0]?.votes ?? 0;
  const me = myRankIn(view);
  return (
    <View style={styles.ranking} testID="vote-board">
      <View style={styles.rankHead}>
        <Text variant="posterL" color={c.ink}>
          {closed ? voteScreenTexts.results : T.ranking}
        </Text>
        {closed ? null : (
          <View style={styles.live} accessibilityLabel={`${T.live} · ${T.votes(view.total)}`}>
            <View style={[styles.dot, { backgroundColor: c.win }]} />
            <Text variant="bodyStrong" color={c.winText} style={styles.liveText} testID="vote-live">
              {T.live} · {T.votes(view.total)}
            </Text>
          </View>
        )}
      </View>
      {me ? (
        <Text variant="bodyStrong" color={c.ink} testID="vote-my-rank">
          {T.rank(me.rank, me.of)}
        </Text>
      ) : null}
      {entries.map((e, i) => {
        const own = view.ownApplicationIds.includes(e.applicationId);
        const mine = view.myVote === e.applicationId;
        const first = i === 0 && e.votes > 0;
        return (
          <View
            key={e.applicationId}
            style={[
              styles.row,
              { backgroundColor: first ? c.poster : c.surface, borderColor: own || mine ? c.accent : c.cardLine },
              (own || mine) && styles.rowMe,
            ]}
            testID="vote-board-row"
          >
            <Num size={30} color={first ? c.posterInk : c.ink} style={styles.rank}>
              {String(e.rank)}
            </Num>
            <View style={styles.rowBody}>
              <View style={styles.rowTitle}>
                <Text variant="bodyStrong" color={first ? c.posterInk : c.ink} style={styles.rowName}>
                  {e.vehicleLabel}
                </Text>
                {winner && closed && e.rank === 1 ? <Tag tone="acc">{voteScreenTexts.winner}</Tag> : null}
              </View>
              <Text variant="caption" color={first ? c.posterMuted : c.inkMuted} style={styles.cardSub}>
                {own ? `${e.pseudo} · ${T.you}` : mine ? `${e.pseudo} · ${T.yourVote}` : e.pseudo}
              </Text>
              <View style={[styles.bar, { backgroundColor: c.line }]}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${rankingBarPercent(e.votes, top)}%`, backgroundColor: first ? c.accent : c.ink },
                  ]}
                />
              </View>
            </View>
            <Num size={24} color={first ? c.posterInk : c.ink} style={styles.votes}>
              {String(e.votes)}
            </Num>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  poster: { padding: space3 + 2, gap: space1 },
  oneVote: { fontSize: 24, lineHeight: 23 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space2 + 2 },
  card: { flexBasis: "46%", flexGrow: 1, borderRadius: 16, overflow: "hidden" },
  cardOn: { transform: [{ translateY: -3 }] },
  waiting: { opacity: 0.75 },
  photo: { height: 96, overflow: "hidden" },
  tag: { position: "absolute", top: 6, left: 6, right: 6, alignItems: "flex-start" },
  veilBadge: { borderWidth: 1.5, borderRadius: 6, paddingHorizontal: space2, paddingVertical: 3, maxWidth: "100%" },
  veilBadgeText: { fontSize: 10.5, letterSpacing: 0.6, textTransform: "uppercase" },
  check: {
    position: "absolute",
    top: space1,
    right: space1,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { paddingTop: space2, paddingHorizontal: space2 + 2, paddingBottom: space2 + 2, gap: 2 },
  cardName: { fontSize: 12, lineHeight: 13 },
  cardSub: { fontSize: 11.5, lineHeight: 15 },
  winner: { flexDirection: "row", alignItems: "center", gap: space3, padding: space3 },
  winnerPhoto: { width: 76, height: 76, borderRadius: 14, overflow: "hidden" },
  winnerText: { flex: 1, minWidth: 0, gap: 2 },
  winnerName: { fontSize: 16, lineHeight: 17 },
  ranking: { gap: space2 },
  // flexWrap : à 384 px et police 1,3, « En direct · N voix » passe sous le titre au lieu de sortir de l'écran (tour 2).
  rankHead: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space2,
  },
  live: { flexDirection: "row", alignItems: "center", flexShrink: 1, gap: space1 + 2 },
  liveText: { fontSize: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2 + 2,
    paddingVertical: space2 + 2,
    paddingHorizontal: space3,
    borderRadius: 14,
    borderWidth: 1,
  },
  rowMe: { borderWidth: 2 },
  rank: { width: 34 },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space2 },
  rowName: { flexShrink: 1, fontFamily: "Archivo-ExtraBold", fontSize: 14 },
  bar: { height: 6, borderRadius: 3, overflow: "hidden", marginTop: space1 + 2 },
  barFill: { height: 6, borderRadius: 3 },
  votes: { minWidth: 30, textAlign: "right" },
});
