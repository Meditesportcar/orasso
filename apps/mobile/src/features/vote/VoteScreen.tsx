// Prix du public (lot 50, prototype DA v2 `s-vote`) : une voix par personne pointée, pas pour soi, modifiable jusqu'à la
// fin de l'événement ; le classement bouge en direct (canal `event:{id}:votes`). Accessible depuis le jour J, les Sorties
// et une notification. Les règles (qui vote, fenêtre, règlement) sont dans l'API ; fermé ou « pas pointé », l'écran le dit.
// Lot C2b (artefact `s-vote`) : on choisit une voiture dans la grille de photos (`.vc`, la sienne grisée « C'est toi »),
// puis on vote avec le bouton du bas (« Choisis une voiture » → « Voter pour … ») ; après le vote, le classement en
// direct (`.board` : rang, nom, barre, voix ; le premier sur l'aplat crème) remplace la grille, « Changer mon vote »
// la rouvre jusqu'à la fin.

import { EmptyState, Icon, Photo, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
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

import { Num, PosterSurface, SmButton } from "@/features/passionne/kit";
import { api } from "@/lib/api";
import { useApplications } from "@/lib/applications";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { useChannel } from "@/lib/realtime";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";
import {
  createLatest,
  createLiveBoard,
  createLoadTracker,
  createVoteSubscription,
  type Latest,
  type LiveBoard,
  type LoadTracker,
} from "./liveBoard";
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
  const [live, setLive] = useState<AudienceVotesChanged | null>(null);
  // Les messages en direct sont réconciliés avec les réponses HTTP : un message antérieur au départ d'une requête de
  // classement est abandonné à l'arrivée de sa réponse (votes manqués pendant une coupure).
  // Réponses ordonnées : une réponse partie avant la dernière appliquée est ignorée (le total ne recule jamais).
  // Les chargements sont suivis (ouverture comprise) pour que le premier abonnement ne les double pas.
  const order = useRef<{
    live: LiveBoard<AudiencePrizeBoard>;
    mine: Latest<AudiencePrizeMine>;
    candidates: Latest<AudienceCandidate[]>;
    loads: { board: LoadTracker; list: LoadTracker };
  } | null>(null);
  if (!order.current) {
    order.current = {
      live: createLiveBoard<AudiencePrizeBoard>(),
      mine: createLatest<AudiencePrizeMine>(),
      candidates: createLatest<AudienceCandidate[]>(),
      loads: { board: createLoadTracker(), list: createLoadTracker() },
    };
  }
  const { live: liveBoard, mine: mineOrder, candidates: candidatesOrder, loads } = order.current;
  const board = useApi(
    () =>
      loads.board.track(async () => {
        const token = liveBoard.begin();
        const fresh = await api.audienceBoard(id);
        const settled = liveBoard.loaded(token, fresh);
        setLive(settled.live);
        return settled.board;
      }),
    [id],
    { enabled: Boolean(id) },
  );
  const mine = useApi(
    () =>
      loads.list.track(async () => {
        const request = mineOrder.begin();
        return mineOrder.settle(request, await api.audienceMine(id)).value;
      }),
    [id],
    { enabled: Boolean(id) },
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // La voiture choisie dans la grille (avant le vote), et la grille rouverte pour changer son vote.
  const [pick, setPick] = useState<AudienceCandidate | null>(null);
  const [changing, setChanging] = useState(false);

  // La grille : tous les véhicules pointés (pas seulement les 100 premiers du classement), par pages de 100.
  const candidates = useApi(
    () =>
      loads.list.track(async () => {
        const request = candidatesOrder.begin();
        const all: AudienceCandidate[] = [];
        let cursor: number | null = 0;
        while (cursor !== null) {
          const page: { items: AudienceCandidate[]; next: number | null } = await api.audienceCandidates(id, cursor);
          all.push(...page.items);
          cursor = page.next;
        }
        return candidatesOrder.settle(request, all).value;
      }),
    [id],
    { enabled: Boolean(id) },
  );

  // Classement en direct : chaque message `votes.changed` porte le total et le top 3, affichés tout de suite ; le
  // classement complet n'est rechargé qu'au plus toutes les 10 s (et au retour au premier plan) : un message par
  // seconde et par téléphone ferait des dizaines de requêtes par seconde pendant un vote de 150 personnes.
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
  // Abonnement confirmé : le premier ne recharge que ce que l'ouverture n'a pas chargé (ouvert hors ligne) ; une
  // reconnexion recharge toujours (des messages ont pu être manqués).
  const subscription = useRef<{ onSubscribed: () => void } | null>(null);
  if (!subscription.current) subscription.current = createVoteSubscription(gates.current, loads);
  const scheduleReload = useCallback(() => gates.current?.board.request(), []);
  const scheduleListReload = useCallback(() => gates.current?.list.request(), []);
  useChannel(
    id ? `event:${id}:votes` : null,
    (event) => {
      // Un pointage change la liste des candidats (relecture du lot 57) : la grille et mon droit de voter se rechargent.
      if (event.type === "votes.candidates.changed") {
        scheduleListReload();
        return;
      }
      if (event.type !== "votes.changed") return;
      setLive(liveBoard.receive(event.payload as AudienceVotesChanged));
      scheduleReload();
    },
    () => subscription.current?.onSubscribed(),
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
        mineOrder.set(next); // un rechargement parti avant le vote ne remet pas l'ancien choix
        mine.setData(next);
        setSaved(true);
        setPick(null);
        setChanging(false);
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        scheduleReload();
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(null);
      }
    },
    [id, mine.setData, mineOrder, scheduleReload],
  );

  const close = () => (router.canGoBack() ? router.back() : router.replace("/acces"));
  const failed = (board.error || mine.error) && !board.data;

  return (
    <FlowScreen
      title={audiencePrizeTexts.title}
      facts={facts || undefined}
      onClose={close}
      footer={
        view === "vote" && mine.data && (!mine.data.votedFor || changing) ? (
          <SmButton
            kind="p"
            big
            wide
            icon="trophy"
            disabled={!pick || busy !== null}
            onPress={() => pick && void vote(pick)}
            testID="vote-cta"
          >
            {pick ? voteScreenTexts.pick(pick.vehicleLabel) : "Choisis une voiture"}
          </SmButton>
        ) : undefined
      }
      onRefresh={async () => {
        await Promise.all([board.reload(), mine.reload(), candidates.reload()]);
      }}
    >
      {failed ? <Notice tone="error">{voteScreenTexts.loadFailed}</Notice> : null}
      {!board.data && !failed ? <Muted variant="body">Chargement…</Muted> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {view === "not_open" ? <EmptyState title={audiencePrizeTexts.title} text={audiencePrizeTexts.notOpen} /> : null}
      {view === "not_checked_in" ? (
        <EmptyState title={audiencePrizeTexts.title} text={audiencePrizeTexts.errors.not_checked_in} />
      ) : null}

      {view === "vote" && board.data && mine.data && (!mine.data.votedFor || changing) ? (
        <>
          <PosterSurface style={styles.poster} testID="vote-poster">
            {mine.data.checkedInAt ? (
              <Text variant="label" color={c.posterMuted}>
                {audiencePrizeTexts.checkedInAt(new Date(mine.data.checkedInAt))}
              </Text>
            ) : null}
            <Text variant="posterL" color={c.posterInk} style={styles.oneVote}>
              {audiencePrizeTexts.oneVote}
            </Text>
            <Text variant="caption" color={c.posterMuted}>
              {audiencePrizeTexts.rules(board.data.winnerPoints)}
            </Text>
          </PosterSurface>
          <Grid
            entries={gridOrder(candidates.data ?? [])}
            mine={mine.data}
            pick={pick?.applicationId ?? null}
            busy={busy}
            onPick={setPick}
          />
        </>
      ) : null}
      {view === "vote" && mine.data?.votedFor && !changing ? (
        <>
          {saved && closesAt ? <Notice testID="vote-saved">{voteScreenTexts.saved(closesAt)}</Notice> : null}
          <SmButton kind="s" icon="undo" onPress={() => setChanging(true)} testID="vote-change">
            Changer mon vote
          </SmButton>
        </>
      ) : null}

      {view === "closed" ? <Notice>{voteScreenTexts.closedNote}</Notice> : null}

      {shown && ((view === "vote" && mine.data?.votedFor && !changing) || view === "closed" || view === "settled") ? (
        <Ranking board={shown} mine={mine.data} settled={view === "settled"} />
      ) : null}
    </FlowScreen>
  );
}

function Grid({
  entries,
  mine,
  pick,
  busy,
  onPick,
}: {
  entries: AudienceCandidate[];
  mine: AudiencePrizeMine;
  pick: string | null;
  busy: string | null;
  onPick: (entry: AudienceCandidate) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  if (entries.length === 0) return <Muted variant="body">{voteScreenTexts.empty}</Muted>;
  return (
    <View style={styles.grid} testID="vote-grid">
      {entries.map((e, i) => {
        const own = isOwn(e, mine);
        const chosen = pick === e.applicationId || (pick === null && mine.votedFor === e.applicationId);
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
            onPress={() => onPick(e)}
            style={[
              styles.card,
              {
                backgroundColor: c.surface,
                boxShadow: chosen ? `0 0 0 3px ${c.accent}, ${t.shadow.shadowCard}` : t.shadow.shadowCard,
              },
              chosen && styles.cardOn,
            ]}
          >
            <View style={styles.photo}>
              <Photo
                source={mediaSource(e.photoUrl)}
                placeholder={`linear-gradient(135deg, ${c.surfaceRaised} 0%, ${c.night} 100%)`}
                style={StyleSheet.absoluteFill}
              />
              {own ? <View style={[StyleSheet.absoluteFill, { backgroundColor: `${c.night}8c` }]} /> : null}
              <View style={styles.tag}>
                <Tag tone={own ? "line" : "ink"}>{own ? "Toi" : voteScreenTexts.number(i + 1)}</Tag>
              </View>
              {chosen ? (
                <View style={[styles.check, { backgroundColor: c.accent }]}>
                  <Icon name="check" size={16} color={c.accentInk} />
                </View>
              ) : null}
            </View>
            <View style={styles.cardBody}>
              <Text variant="posterS" color={own ? c.inkMuted : c.ink} style={styles.cardName}>
                {e.vehicleLabel}
              </Text>
              <Text variant="caption" color={c.inkMuted} style={styles.cardSub}>
                {own
                  ? voteScreenTexts.you
                  : chosen && mine.votedFor === e.applicationId
                    ? voteScreenTexts.yourVote
                    : e.pseudo}
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
        <Text variant="posterL" color={c.ink}>
          {settled ? voteScreenTexts.results : audiencePrizeTexts.ranking}
        </Text>
        {settled ? null : (
          <View
            style={styles.live}
            accessibilityLabel={`${audiencePrizeTexts.live} · ${audiencePrizeTexts.votes(board.total)}`}
          >
            <View style={[styles.dot, { backgroundColor: c.win }]} />
            <Text variant="bodyStrong" color={c.winText} style={styles.liveText} testID="vote-live">
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
          <View
            key={e.applicationId}
            style={[
              styles.row,
              { backgroundColor: first ? c.poster : c.surface, borderColor: own ? c.accent : c.cardLine },
              own && styles.rowMe,
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
                {board.winner?.applicationId === e.applicationId ? (
                  <Tag tone="acc">{voteScreenTexts.winner}</Tag>
                ) : null}
              </View>
              <Text variant="caption" color={first ? c.posterMuted : c.inkMuted} style={styles.cardSub}>
                {own ? `${e.pseudo} · ${voteScreenTexts.you}` : e.pseudo}
              </Text>
              <View style={[styles.bar, { backgroundColor: c.line }]}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${barPercent(e.votes, top)}%`,
                      backgroundColor: first ? c.accent : c.ink,
                    },
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
  photo: { height: 96, overflow: "hidden" },
  tag: { position: "absolute", top: 6, left: 6 },
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
  ranking: { gap: space2 },
  rankHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space2 },
  live: { flexDirection: "row", alignItems: "center", gap: space1 + 2 },
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
