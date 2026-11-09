// La liste des votes d'un événement (lot R7l3, maquette R7.17 `v-pass` › `vs_list`) : une ligne par vote, « Toutes catégories ·
// Voté », « Plus belle japonaise · Ouvert », « Concours de rupteur · 8 min restantes », « Plus belle allemande · Ouvre à
// 16 h » (grisée, avec ce qui manque), « Clos · voir le classement » (avec la carte « Résultat » du podium). Ouverte depuis la
// fiche de l'événement, le Jour J, l'Accueil, les Sorties et une notification. Les règles (qui vote, quand un vote ouvre,
// quand le classement est servi) sont dans l'API : l'écran met en mots ce qu'elle répond. Temps réel : canal `event:{id}:votes`.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { openVotesIn, votePassTexts as T, type VoteRow, type VoteView, voteResultCard, voteRow } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { SmButton } from "@/features/passionne/kit";
import { errorMessage } from "@/lib/http";
import { useNow } from "@/lib/useNow";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";
import { useEventRef, useVotesList } from "./useVote";

const { space1, space2, space3 } = tokens.spacing;

export function VotesList() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { eventId: ref, titre } = useLocalSearchParams<{ eventId: string; titre?: string }>();
  const event = useEventRef(ref);
  const at = useNow(30_000);
  const list = useVotesList(event.eventId);
  const items = list.data?.items ?? [];
  const open = openVotesIn(items);
  const title = titre || event.title || null;
  const close = () => (router.canGoBack() ? router.back() : router.replace("/acces"));
  const failed = (list.error || event.error) && !list.data;
  // « Réessayer » relance d'abord la résolution de l'événement (adresse d'une notification ouverte hors ligne), puis la liste.
  const retry = async () => {
    if (event.error) await event.reload();
    await list.reload();
  };
  const openVote = (vote: VoteView) =>
    router.push(`/vote/${event.eventId}?vote=${vote.id}${title ? `&titre=${encodeURIComponent(title)}` : ""}` as never);

  return (
    <FlowScreen
      title={open > 0 ? T.listOpen(open) : T.listTitle}
      facts={title || undefined}
      onClose={close}
      onRefresh={async () => {
        await list.reload();
      }}
    >
      {failed ? (
        <>
          <Notice tone="error" testID="votes-failed">
            {event.error ? T.listLoadFailed : errorMessage(list.error)}
          </Notice>
          <SmButton kind="s" icon="undo" onPress={() => void retry()} testID="votes-retry">
            {T.retry}
          </SmButton>
        </>
      ) : null}
      {list.error && list.data ? (
        <Notice tone="error" testID="votes-stale">
          {T.listLoadFailed}
        </Notice>
      ) : null}
      {!list.data && !failed ? <Muted variant="body">{T.loading}</Muted> : null}
      {list.data && items.length === 0 ? <Muted variant="body">{T.listEmpty}</Muted> : null}

      <View style={styles.list} testID="votes-list">
        {items.map((v) => (
          <VoteLine key={v.id} vote={v} row={voteRow(v, at)} onOpen={() => openVote(v)} />
        ))}
      </View>

      {items.length > 0 ? (
        <View style={styles.notes}>
          <Note icon="lock">
            <Text variant="caption" color={c.inkMuted}>
              {T.ruleNote} {T.rankingNote}
            </Text>
          </Note>
          <Note icon="place">
            <Text variant="caption" color={c.inkMuted}>
              {T.whoVotes}
            </Text>
          </Note>
        </View>
      ) : null}
    </FlowScreen>
  );
}

function Note({ icon, children }: { icon: "lock" | "place"; children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <View style={styles.note}>
      <Icon name={icon} size={18} color={t.color.accent} />
      <View style={styles.noteText}>{children}</View>
    </View>
  );
}

function VoteLine({ vote, row, onOpen }: { vote: VoteView; row: VoteRow; onOpen: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  const podium = voteResultCard(vote);
  const icon = vote.kind === "all_categories" ? "trophy" : "flag";
  const tint = row.muted ? c.inkFaint : c.ink;
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: c.surface,
          boxShadow: t.shadow.shadowCard,
          borderColor: row.hot ? c.accent : "transparent",
        },
        row.muted && styles.muted,
      ]}
      testID={`votes-row-${vote.id}`}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${vote.title} : ${row.detail}`}
        accessibilityState={{ disabled: row.muted }}
        disabled={row.muted}
        onPress={onOpen}
        style={({ pressed }) => [styles.head, pressed && styles.pressed]}
        testID={`votes-open-${vote.id}`}
      >
        <View
          style={[
            styles.round,
            { backgroundColor: c.surfaceRaised },
            vote.kind === "all_categories" && !row.muted && { borderColor: c.accent, borderWidth: 1.5 },
          ]}
        >
          <Icon name={icon} size={20} color={row.muted ? c.inkFaint : c.ink} />
        </View>
        <View style={styles.text}>
          <Text variant="bodyStrong" color={tint} testID={`votes-title-${vote.id}`}>
            {vote.title}
          </Text>
          <Text variant="caption" color={row.muted ? c.inkFaint : c.inkMuted} testID={`votes-detail-${vote.id}`}>
            {row.detail}
          </Text>
        </View>
        <View style={[styles.chip, { borderColor: row.muted ? c.line : c.ink }]} testID={`votes-chip-${vote.id}`}>
          <Icon name={row.chipIcon === "chevron" ? "next" : row.chipIcon} size={13} color={tint} />
          <Text variant="label" color={tint} style={styles.chipText}>
            {row.chip}
          </Text>
        </View>
      </Pressable>
      {podium ? (
        <View style={[styles.result, { borderColor: c.line }]} testID={`votes-result-${vote.id}`}>
          <Text variant="label" color={c.inkMuted}>
            {T.resultTitle}
          </Text>
          {podium.map((p) => (
            <View key={p.rank} style={styles.resultRow}>
              <Text variant="bodyStrong" color={c.ink} style={styles.resultRank}>
                {T.podium[p.rank - 1]}
              </Text>
              <Text variant="body" color={c.ink} style={styles.resultName}>
                {p.label}
              </Text>
              <Text variant="caption" color={c.inkMuted}>
                {T.resultVotes(p.votes)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space2 + 2 },
  card: { borderRadius: 18, borderWidth: 2, padding: space3 },
  muted: { opacity: 0.7 },
  pressed: { opacity: 0.85 },
  head: { flexDirection: "row", alignItems: "center", gap: space2 + 2 },
  round: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, minWidth: 0, gap: 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space1,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: space2 + 2,
    paddingVertical: 6,
  },
  chipText: { fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase" },
  result: { marginTop: space2 + 2, paddingTop: space2 + 2, borderTopWidth: 1, gap: space1 + 2 },
  resultRow: { flexDirection: "row", alignItems: "center", gap: space2 },
  resultRank: { width: 34 },
  resultName: { flex: 1, minWidth: 0 },
  notes: { gap: space2 + 2, marginTop: space1 },
  note: { flexDirection: "row", alignItems: "flex-start", gap: space2 + 2 },
  noteText: { flex: 1, minWidth: 0 },
});
