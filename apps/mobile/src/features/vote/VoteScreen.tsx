// Prix du public (lot 50, prototype DA v2 `s-vote`) : une voix par personne pointée, pas pour soi, modifiable jusqu'à la
// fin de l'événement ; le classement bouge en direct (canal `event:{id}:votes`). Accessible depuis le jour J, les Sorties
// et une notification. Les règles (qui vote, fenêtre, règlement) sont dans l'API ; fermé ou « pas pointé », l'écran le dit.

import { EmptyState, Icon, OutlinedText, Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type AudienceCandidate,
  type AudiencePrizeBoard,
  type AudiencePrizeMine,
  type AudienceVotesChanged,
  audiencePrizeTexts,
  voteScreenTexts,
} from "@orasso/shared";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { useApplications } from "@/lib/applications";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { useChannel } from "@/lib/realtime";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";
import { applyTop3, BOARD_RELOAD_MS, barPercent, gridOrder, isOwn, myRank, voteView } from "./model";
import { createRefreshGate, type RefreshGate } from "./refreshGate";

const { space1, space2, space3 } = tokens.spacing;

export function VoteScreen() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { id, titre } = useLocalSearchParams<{ id: string; titre?: string }>();
  const { upcoming, past } = useApplications();
  const known = [...(upcoming ?? []), ...(past ?? [])].find((a) => a.event.id === id)?.event.title;
  const title = titre || known || null;
  const board = useApi(() => api.audienceBoard(id), [id], { enabled: Boolean(id) });
  const mine = useApi(() => api.audienceMine(id), [id], { enabled: Boolean(id) });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // La grille : tous les véhicules pointés (pas seulement les 100 premiers du classement), par pages de 100.
  const candidates = useApi(
    async () => {
      const all: AudienceCandidate[] = [];
      let cursor: number | null = 0;
      while (cursor !== null) {
        const page: { items: AudienceCandidate[]; next: number | null } = await api.audienceCandidates(id, cursor);
        all.push(...page.items);
        cursor = page.next;
      }
      return all;
    },
    [id],
    { enabled: Boolean(id) },
  );

  // Classement en direct : chaque message `votes.changed` porte le total et le top 3, affichés tout de suite ; le
  // classement complet n'est rechargé qu'au plus toutes les 10 s (et au retour au premier plan) : un message par
  // seconde et par téléphone ferait des dizaines de requêtes par seconde pendant un vote de 150 personnes.
  const [live, setLive] = useState<AudienceVotesChanged | null>(null);
  // Deux rechargements regroupés (`refreshGate`) : le classement, et la grille avec mon droit de voter. Chacun au plus
  // toutes les 10 s, jamais deux à la fois, avec un dernier rafraîchissement garanti après une rafale.
  const reloaders = useRef({ board: board.reload, candidates: candidates.reload, mine: mine.reload });
  reloaders.current = { board: board.reload, candidates: candidates.reload, mine: mine.reload };
  const gates = useRef<{ board: RefreshGate; list: RefreshGate } | null>(null);
  if (!gates.current) {
    gates.current = {
      board: createRefreshGate({ run: () => reloaders.current.board(), minMs: BOARD_RELOAD_MS }),
      list: createRefreshGate({
        run: () => Promise.all([reloaders.current.candidates(), reloaders.current.mine()]),
        minMs: BOARD_RELOAD_MS,
      }),
    };
  }
  const scheduleReload = useCallback(() => gates.current?.board.request(), []);
  const scheduleListReload = useCallback(() => gates.current?.list.request(), []);
  const subscribedOnce = useRef(false);
  useChannel(
    id ? `event:${id}:votes` : null,
    (event) => {
      // Un pointage change la liste des candidats (relecture du lot 57) : la grille et mon droit de voter se rechargent.
      if (event.type === "votes.candidates.changed") {
        scheduleListReload();
        return;
      }
      if (event.type !== "votes.changed") return;
      setLive(event.payload as AudienceVotesChanged);
      scheduleReload();
    },
    () => {
      // Abonnement confirmé : la première fois, les données viennent d'être chargées ; ensuite c'est une reconnexion,
      // et des messages ont pu être manqués pendant la coupure.
      if (!subscribedOnce.current) {
        subscribedOnce.current = true;
        return;
      }
      scheduleReload();
      scheduleListReload();
    },
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        scheduleReload();
        scheduleListReload();
      }
    });
    return () => sub.remove();
  }, [scheduleReload, scheduleListReload]);
  useEffect(
    () => () => {
      gates.current?.board.dispose();
      gates.current?.list.dispose();
    },
    [],
  ); // Le total et le top 3 du message, reportés sur le classement chargé.
  const shown: AudiencePrizeBoard | null = board.data
    ? {
        ...board.data,
        total: live ? Math.max(live.total, 0) : board.data.total,
        entries: live ? applyTop3(board.data.entries, live.top3) : board.data.entries,
      }
    : null;

  const view = voteView(board.data, mine.data);
  const closesAt = mine.data ? new Date(mine.data.closesAt) : null;
  const facts = [title, view === "vote" && closesAt ? audiencePrizeTexts.openUntil(closesAt) : null]
    .filter(Boolean)
    .join(" · ");

  const vote = useCallback(
    async (entry: AudienceCandidate) => {
      setBusy(entry.applicationId);
      setError(null);
      try {
        const next = await api.audienceVote(id, entry.applicationId);
        mine.setData(next);
        setSaved(true);
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        scheduleReload();
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(null);
      }
    },
    [id, mine.setData, scheduleReload],
  );

  const close = () => (router.canGoBack() ? router.back() : router.replace("/acces"));
  const failed = (board.error || mine.error) && !board.data;

  return (
    <FlowScreen
      title={audiencePrizeTexts.title}
      onClose={close}
      onRefresh={async () => {
        await Promise.all([board.reload(), mine.reload(), candidates.reload()]);
      }}
    >
      {facts && view !== "vote" ? <Muted variant="label">{facts}</Muted> : null}
      {failed ? <Notice tone="error">{voteScreenTexts.loadFailed}</Notice> : null}
      {!board.data && !failed ? <Muted variant="body">Chargement…</Muted> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {view === "not_open" ? <EmptyState title={audiencePrizeTexts.title} text={audiencePrizeTexts.notOpen} /> : null}
      {view === "not_checked_in" ? (
        <EmptyState title={audiencePrizeTexts.title} text={audiencePrizeTexts.errors.not_checked_in} />
      ) : null}

      {view === "vote" && board.data && mine.data ? (
        <>
          <View style={[styles.poster, { backgroundColor: c.poster }]} testID="vote-poster">
            {facts ? (
              <Text variant="label" color={c.posterMuted} testID="vote-facts">
                {facts}
              </Text>
            ) : null}
            {mine.data.checkedInAt ? (
              <Text variant="label" color={c.posterMuted}>
                {audiencePrizeTexts.checkedInAt(new Date(mine.data.checkedInAt))}
              </Text>
            ) : null}
            <Text variant="posterL" color={c.posterInk}>
              {audiencePrizeTexts.oneVote}
            </Text>
            <Text variant="caption" color={c.posterMuted}>
              {audiencePrizeTexts.rules(board.data.winnerPoints)}
            </Text>
          </View>
          {saved && mine.data.votedFor && closesAt ? (
            <Notice testID="vote-saved">{voteScreenTexts.saved(closesAt)}</Notice>
          ) : (
            <Muted variant="caption">{voteScreenTexts.chooseHint}</Muted>
          )}
          <Grid entries={gridOrder(candidates.data ?? [])} mine={mine.data} busy={busy} onVote={(e) => void vote(e)} />
        </>
      ) : null}

      {view === "closed" ? <Notice>{voteScreenTexts.closedNote}</Notice> : null}

      {shown && (view === "vote" || view === "closed" || view === "settled") ? (
        <Ranking board={shown} mine={mine.data} settled={view === "settled"} />
      ) : null}
    </FlowScreen>
  );
}

function Grid({
  entries,
  mine,
  busy,
  onVote,
}: {
  entries: AudienceCandidate[];
  mine: AudiencePrizeMine;
  busy: string | null;
  onVote: (entry: AudienceCandidate) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  if (entries.length === 0) return <Muted variant="body">{voteScreenTexts.empty}</Muted>;
  return (
    <View style={styles.grid} testID="vote-grid">
      {entries.map((e, i) => {
        const own = isOwn(e, mine);
        const chosen = mine.votedFor === e.applicationId;
        return (
          <Pressable
            key={e.applicationId}
            testID={own ? "vote-card-own" : "vote-card"}
            accessibilityRole="button"
            accessibilityLabel={
              own ? `${e.vehicleLabel}. ${voteScreenTexts.you}` : voteScreenTexts.pick(e.vehicleLabel)
            }
            accessibilityState={{ disabled: own || busy !== null, selected: chosen }}
            disabled={own || busy !== null}
            onPress={() => onVote(e)}
            style={[
              styles.card,
              { backgroundColor: c.plate, borderColor: chosen ? c.accent : "transparent", opacity: own ? 0.55 : 1 },
            ]}
          >
            <View style={styles.photo}>
              <Photo
                source={mediaSource(e.photoUrl)}
                placeholder={`linear-gradient(135deg, ${c.surfaceRaised} 0%, ${c.night} 100%)`}
                style={StyleSheet.absoluteFill}
              />
              <View style={[styles.tag, { backgroundColor: own ? c.plate : c.accent }]}>
                <Text variant="credit" color={own ? c.plateInk : c.accentInk}>
                  {own ? voteScreenTexts.you : voteScreenTexts.number(i + 1)}
                </Text>
              </View>
              {chosen ? (
                <View style={[styles.check, { backgroundColor: c.accent }]}>
                  <Icon name="check" size={16} color={c.accentInk} />
                </View>
              ) : null}
            </View>
            <View style={styles.cardBody}>
              <Text variant="bodyStrong" color={c.plateInk}>
                {e.vehicleLabel}
              </Text>
              <Text variant="meta" color={c.plateMuted}>
                {chosen ? voteScreenTexts.yourVote : e.pseudo}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function Ranking({
  board,
  mine,
  settled,
}: {
  board: AudiencePrizeBoard;
  mine: AudiencePrizeMine | null;
  settled: boolean;
}) {
  const { t } = useTheme();
  const c = t.color;
  const top = board.entries[0]?.votes ?? 0;
  const me = mine ? myRank(board, mine) : null;
  return (
    <View style={styles.ranking} testID="vote-board">
      <View style={styles.rankHead}>
        <Text variant="posterM" color={c.ink}>
          {settled ? voteScreenTexts.results : audiencePrizeTexts.ranking}
        </Text>
        {settled ? null : (
          <View
            style={styles.live}
            accessibilityLabel={`${audiencePrizeTexts.live} · ${audiencePrizeTexts.votes(board.total)}`}
          >
            <View style={[styles.dot, { backgroundColor: c.accent }]} />
            <Text variant="label" color={c.inkMuted} testID="vote-live">
              {audiencePrizeTexts.live} · {audiencePrizeTexts.votes(board.total)}
            </Text>
          </View>
        )}
      </View>
      {settled && !board.winner ? <Muted variant="caption">{voteScreenTexts.noWinner}</Muted> : null}
      {me && settled ? (
        <Text variant="bodyStrong" color={c.ink} testID="vote-my-rank">
          {audiencePrizeTexts.rank(me.rank, me.of)}
        </Text>
      ) : null}
      {board.entries.map((e, i) => {
        const own = mine ? isOwn(e, mine) : false;
        const first = i === 0 && e.votes > 0;
        return (
          <View key={e.applicationId} style={styles.row} testID="vote-board-row">
            <OutlinedText
              on="ground"
              variant="posterL"
              color={first ? c.accentText : c.ink}
              containerStyle={styles.rank}
            >
              {String(e.rank)}
            </OutlinedText>
            <View style={[styles.rowBody, { backgroundColor: c.plate, borderColor: own ? c.accent : "transparent" }]}>
              <View style={styles.rowTitle}>
                <Text variant="bodyStrong" color={c.plateInk} style={styles.rowName}>
                  {e.vehicleLabel}
                </Text>
                {board.winner?.applicationId === e.applicationId ? (
                  <Text variant="label" color={c.accent}>
                    {voteScreenTexts.winner}
                  </Text>
                ) : null}
              </View>
              <Text variant="meta" color={c.plateMuted}>
                {own ? `${e.pseudo} · ${voteScreenTexts.you}` : e.pseudo}
              </Text>
              <View style={[styles.bar, { backgroundColor: c.plateLine }]}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${barPercent(e.votes, top)}%`, backgroundColor: first ? c.accent : c.plateInk },
                  ]}
                />
              </View>
            </View>
            <Text variant="numberNarrow" color={c.ink} style={styles.votes}>
              {e.votes}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  poster: { borderRadius: 24, padding: space3, gap: space1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  card: { flexBasis: "47%", flexGrow: 1, borderRadius: 18, borderWidth: 2, overflow: "hidden" },
  photo: { height: 104, overflow: "hidden" },
  tag: {
    position: "absolute",
    top: space1,
    left: space1,
    borderRadius: 6,
    paddingHorizontal: space2,
    paddingVertical: 2,
  },
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
  cardBody: { padding: space2, gap: 2 },
  ranking: { gap: space2 },
  rankHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space2 },
  live: { flexDirection: "row", alignItems: "center", gap: space1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: space2 },
  rank: { width: 40, alignItems: "center" },
  rowBody: { flex: 1, borderRadius: 14, borderWidth: 2, padding: space2, gap: 2 },
  rowTitle: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space2 },
  rowName: { flexShrink: 1 },
  bar: { height: 6, borderRadius: 3, overflow: "hidden", marginTop: space1 },
  barFill: { height: 6, borderRadius: 3 },
  votes: { minWidth: 36, textAlign: "right" },
});
