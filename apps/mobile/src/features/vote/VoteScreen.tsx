// Prix du public (lot 50, prototype DA v2 `s-vote`) : une voix par personne pointée, pas pour soi, modifiable jusqu'à la
// fin de l'événement ; le classement bouge en direct (canal `event:{id}:votes`). Accessible depuis le jour J, les Sorties
// et une notification. Les règles (qui vote, fenêtre, règlement) sont dans l'API ; fermé ou « pas pointé », l'écran le dit.

import { EmptyState, Icon, OutlinedText, Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type AudiencePrizeBoard,
  type AudiencePrizeEntry,
  type AudiencePrizeMine,
  audiencePrizeTexts,
  voteScreenTexts,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { useApplications } from "@/lib/applications";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { useChannel } from "@/lib/realtime";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";
import { barPercent, gridOrder, isOwn, myRank, voteView } from "./model";

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

  // Classement en direct : le serveur regroupe les diffusions (une par seconde au plus).
  const reload = board.reload;
  useChannel(id ? `event:${id}:votes` : null, (event) => {
    if (event.type === "votes.changed") void reload();
  });

  const view = voteView(board.data, mine.data);
  const closesAt = mine.data ? new Date(mine.data.closesAt) : null;
  const facts = [title, view === "vote" && closesAt ? audiencePrizeTexts.openUntil(closesAt) : null]
    .filter(Boolean)
    .join(" · ");

  const vote = useCallback(
    async (entry: AudiencePrizeEntry) => {
      setBusy(entry.applicationId);
      setError(null);
      try {
        const next = await api.audienceVote(id, entry.applicationId);
        mine.setData(next);
        setSaved(true);
        await reload();
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(null);
      }
    },
    [id, mine.setData, reload],
  );

  const close = () => (router.canGoBack() ? router.back() : router.replace("/acces"));
  const failed = (board.error || mine.error) && !board.data;

  return (
    <FlowScreen
      title={audiencePrizeTexts.title}
      onClose={close}
      onRefresh={async () => {
        await Promise.all([board.reload(), mine.reload()]);
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
          <Grid entries={gridOrder(board.data.entries)} mine={mine.data} busy={busy} onVote={(e) => void vote(e)} />
        </>
      ) : null}

      {view === "closed" ? <Notice>{voteScreenTexts.closedNote}</Notice> : null}

      {board.data && (view === "vote" || view === "closed" || view === "settled") ? (
        <Ranking board={board.data} mine={mine.data} settled={view === "settled"} />
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
  entries: AudiencePrizeEntry[];
  mine: AudiencePrizeMine;
  busy: string | null;
  onVote: (entry: AudiencePrizeEntry) => void;
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
