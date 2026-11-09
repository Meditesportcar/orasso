// Un vote en détail (lot R7l2, maquette R7.16 : `vl_rup` concours prêt à lancer, `vl_run` vote lancé) : les candidats d'un
// vote « à la main » (liste, retirer, ajouter par recherche d'un pseudo ou d'un modèle parmi les retenues, ou par scan de leur
// QR), la durée, « Lancer le vote » ; une fois ouvert, le classement en direct pour l'équipe et « Clore maintenant ».
// Propriétaire et co-organisateurs seulement (le staff n'a que la liste, lecture seule).
import { Button, Chip, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  type ApplicationForTriage,
  voteOrgaLabels as L,
  type VoteManageItem,
  voteDurationOptions,
  voteScanOutcome,
  voteSearchView,
  voteStatus,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { VoteScanSheet } from "@/features/staff/VoteScanSheet";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { createRequestGate } from "@/lib/requestGate";
import { useNow } from "@/lib/useNow";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";
import { ConfirmSheet } from "../ConfirmSheet";
import { OrgaFailure } from "../OrgaGate";
import { useVotesData } from "./useVotesData";

const { space1, space2, space3 } = tokens.spacing;

type Confirm = "launch" | "close" | "remove" | null;

export function VoteDetail({ eventId }: { eventId: string }) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { vote: voteId } = useLocalSearchParams<{ vote?: string }>();
  const at = useNow(30_000);
  const { manage, event, staleMinutes } = useVotesData(eventId, { organizer: true });
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ApplicationForTriage[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  // Seule la dernière recherche compte ; elle est jetée aussi quand le champ est vidé ou l'écran quitté.
  const gate = useRef(createRequestGate(() => null)).current;

  const vote: VoteManageItem | undefined = manage.data?.items.find((v) => v.id === voteId);
  const canWrite = manage.data?.canWrite === true;
  const published = event.data?.status === "published";
  const status = vote ? voteStatus(vote, { now: at, published, canWrite }) : null;
  const upcoming = vote?.state === "upcoming";
  const hand = vote?.candidateMode === "hand";
  const candidates = vote?.handCandidates ?? [];
  const back = () => (router.canGoBack() ? router.back() : router.replace(`/evenement/${eventId}/votes`));

  // Une page de résultats (12 voitures), la suite s'ajoute à la fin ; la réponse d'une saisie passée ou d'un champ vidé est jetée.
  function loadPage(q: string, cursor: string | null) {
    const ticket = gate.start();
    setSearching(true);
    api
      .voteSearchRetained(eventId, q, cursor)
      .then((page) => {
        if (!ticket.latest()) return;
        setSearching(false);
        setHits((old) => (cursor ? [...(old ?? []), ...page.items] : page.items));
        setNext(page.nextCursor);
        setSearchError(null);
      })
      .catch((err) => {
        if (!ticket.latest()) return;
        setSearching(false);
        setHits(null);
        setNext(null);
        setSearchError(errorMessage(err));
      });
  }

  // Recherche d'une voiture retenue : au moins deux lettres.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `loadPage` ne lit que `eventId` et la porte, stables ici.
  useEffect(() => {
    gate.invalidate();
    const q = query.trim();
    setSearching(false);
    if (q.length < 2) {
      setHits(null);
      setNext(null);
      setSearchError(null);
      return;
    }
    const timer = setTimeout(() => loadPage(q, null), 300);
    return () => {
      clearTimeout(timer);
      gate.invalidate();
    };
  }, [query, eventId, gate]);

  async function run(key: string, action: () => Promise<unknown>, done?: string) {
    setBusy(key);
    setError(null);
    try {
      await action();
      if (done) setNotice(done);
      await manage.reload();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function confirmed() {
    if (!vote || !confirm) return;
    const ok = await run(
      confirm,
      () =>
        confirm === "launch"
          ? api.voteOpen(eventId, vote.id)
          : confirm === "close"
            ? api.voteClose(eventId, vote.id)
            : api.voteRemove(eventId, vote.id),
      confirm === "launch" ? L.launched : confirm === "close" ? L.closed : undefined,
    );
    if (ok) {
      setConfirm(null);
      if (confirm === "remove") back();
    }
  }

  async function addByQr(payload: string) {
    if (!vote) throw new Error("Vote introuvable");
    const updated = await api.voteAddCandidate(eventId, vote.id, { qr: payload });
    await manage.reload();
    return voteScanOutcome(updated);
  }

  const enteredIds = new Set(manage.data?.enteredApplicationIds ?? []);
  const taken = new Set(candidates.map((x) => x.applicationId));
  const { results, needMore, showNone, canMore } = voteSearchView({ items: hits, next, loading: searching }, taken);

  // Toutes les voitures de la page sont déjà candidates : la page suivante se charge d'elle-même.
  // biome-ignore lint/correctness/useExhaustiveDependencies: déclenché par l'état de la recherche seulement.
  useEffect(() => {
    if (needMore && next) loadPage(query.trim(), next);
  }, [needMore, next]);

  return (
    <FlowScreen
      title={vote?.title ?? L.screenTitle}
      facts={event.data?.title}
      onClose={back}
      onRefresh={async () => {
        await Promise.all([manage.reload(), event.reload()]);
      }}
      footer={
        vote && status?.canLaunch ? (
          <View style={styles.footer}>
            {status.launchBlocked ? <Muted variant="caption">{status.launchBlocked}</Muted> : null}
            <Button
              icon="spark"
              disabled={Boolean(busy) || Boolean(status.launchBlocked)}
              onPress={() => setConfirm("launch")}
              fullWidth
              testID="vote-detail-launch"
            >
              {L.launchFor(
                vote.durationMinutes === null
                  ? "jusqu'à la fin"
                  : (voteDurationOptions.find((o) => o.value === vote.durationMinutes)?.label ??
                      `${vote.durationMinutes} min`),
              )}
            </Button>
          </View>
        ) : undefined
      }
      overlays={
        <>
          {confirm && vote ? (
            <ConfirmSheet
              visible
              title={
                confirm === "launch"
                  ? L.launchTitle(vote.title)
                  : confirm === "close"
                    ? L.closeTitle(vote.title)
                    : L.removeTitle(vote.title)
              }
              body={confirm === "launch" ? L.launchBody : confirm === "close" ? L.closeBody : L.removeBody}
              confirmLabel={
                confirm === "launch" ? L.launchConfirm : confirm === "close" ? L.closeConfirm : L.removeConfirm
              }
              confirmIcon={confirm === "launch" ? "spark" : confirm === "close" ? "close" : "trash"}
              cancelLabel={confirm === "remove" ? L.keep : L.cancel}
              danger={confirm === "remove"}
              busy={busy === confirm}
              error={error}
              onConfirm={() => void confirmed()}
              onClose={() => {
                setConfirm(null);
                setError(null);
              }}
            />
          ) : null}
          {vote && hand ? (
            <VoteScanSheet
              visible={scanning}
              voteTitle={vote.title}
              count={candidates.length}
              onScan={addByQr}
              onClose={() => setScanning(false)}
            />
          ) : null}
        </>
      }
    >
      <OrgaFailure error={manage.error} />
      {error && !confirm ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice testID="vote-detail-notice">{notice}</Notice> : null}
      {!vote && manage.data ? <Notice tone="error">{L.empty2}</Notice> : null}
      {!vote && !manage.data && !manage.error ? <Muted variant="body">{L.loading}</Muted> : null}

      {vote && status ? (
        <>
          <Plate style={styles.block} testID="vote-detail-status">
            <Text variant="bodyStrong" color={c.plateInk}>
              {status.text}
            </Text>
            {vote.state === "open" ? (
              <Text variant="caption" color={c.plateMuted}>
                {L.bell}
              </Text>
            ) : null}
          </Plate>

          {upcoming && vote.kind !== "all_categories" && vote.openMode !== "first_entry" && canWrite ? (
            <>
              <SectionTitle>{L.durationQuestion}</SectionTitle>
              <View style={styles.wrap}>
                {voteDurationOptions
                  .filter((o) => o.value !== "custom")
                  .map((o) => (
                    <Chip
                      key={String(o.value)}
                      selected={vote.durationMinutes === o.value}
                      onPress={() =>
                        void run("duration", () =>
                          api.voteUpdate(eventId, vote.id, { durationMinutes: o.value as number | null }),
                        )
                      }
                      accessibilityLabel={o.label}
                    >
                      {o.label}
                    </Chip>
                  ))}
              </View>
            </>
          ) : null}

          {hand ? (
            <>
              <SectionTitle>{L.candidatesTitle}</SectionTitle>
              <Muted variant="caption" testID="vote-candidates-count">
                {L.candidatesCount(candidates.filter((x) => x.entered).length, candidates.length)}
              </Muted>
              {candidates.length === 0 ? <Muted variant="body">{L.candidatesNone}</Muted> : null}
              <View style={styles.list} testID="vote-candidates">
                {candidates.map((x) => (
                  <Plate key={x.applicationId} style={styles.candidate} testID={`vote-candidate-${x.applicationId}`}>
                    <View style={styles.grow}>
                      <Text variant="bodyStrong" color={c.plateInk}>
                        {x.vehicleLabel}
                      </Text>
                      <Text variant="caption" color={c.plateMuted}>
                        {`${x.pseudo} · ${x.entered ? L.entered : L.notEntered}`}
                      </Text>
                    </View>
                    {upcoming && canWrite ? (
                      <Button
                        variant="plate"
                        icon="close"
                        disabled={Boolean(busy)}
                        onPress={() =>
                          void run(`rm-${x.applicationId}`, () =>
                            api.voteRemoveCandidate(eventId, vote.id, x.applicationId),
                          )
                        }
                        accessibilityLabel={`${L.removeCandidate} ${x.vehicleLabel}`}
                        testID={`vote-candidate-remove-${x.applicationId}`}
                      >
                        {L.removeCandidate}
                      </Button>
                    ) : null}
                  </Plate>
                ))}
              </View>

              {upcoming && canWrite ? (
                <>
                  <Button
                    variant="secondary"
                    icon="qr"
                    onPress={() => setScanning(true)}
                    fullWidth
                    testID="vote-scan-open"
                  >
                    {L.scanButton}
                  </Button>
                  <TextField
                    label={L.searchField}
                    value={query}
                    onChangeText={setQuery}
                    autoCorrect={false}
                    testID="vote-search"
                  />
                  {query.trim().length > 0 && query.trim().length < 2 ? (
                    <Muted variant="caption">{L.searchShort}</Muted>
                  ) : null}
                  {searchError ? <Notice tone="error">{L.searchError}</Notice> : null}
                  {showNone && !searchError ? <Muted variant="body">{L.searchNone}</Muted> : null}
                  <View style={styles.list}>
                    {results.map((h) => (
                      <Plate key={h.id} style={styles.candidate} testID={`vote-hit-${h.id}`}>
                        <View style={styles.grow}>
                          <Text variant="bodyStrong" color={c.plateInk}>
                            {h.vehicle?.label ?? "Voiture"}
                          </Text>
                          <Text variant="caption" color={c.plateMuted}>
                            {`${h.applicant.pseudo} · ${enteredIds.has(h.id) ? L.retained : L.retainedNotEntered}`}
                          </Text>
                        </View>
                        <Button
                          variant="plate"
                          icon="add"
                          disabled={Boolean(busy)}
                          onPress={() =>
                            void run(`add-${h.id}`, () =>
                              api.voteAddCandidate(eventId, vote.id, { applicationId: h.id }),
                            )
                          }
                          testID={`vote-hit-add-${h.id}`}
                        >
                          {L.addCandidate}
                        </Button>
                      </Plate>
                    ))}
                  </View>
                  {canMore ? (
                    <Button
                      variant="secondary"
                      icon="add"
                      disabled={searching}
                      onPress={() => loadPage(query.trim(), next)}
                      testID="vote-search-more"
                    >
                      {L.searchMore}
                    </Button>
                  ) : null}
                </>
              ) : (
                <Muted variant="caption">{L.lockedCandidates}</Muted>
              )}
            </>
          ) : null}

          {vote.state !== "upcoming" ? (
            <>
              <SectionTitle>{L.rankingTitle}</SectionTitle>
              <Muted variant="caption">
                {vote.state === "open"
                  ? staleMinutes !== null
                    ? L.rankingStale
                    : L.rankingLive
                  : L.voiceCount(vote.total)}
              </Muted>
              {vote.ranking.length === 0 ? <Muted variant="body">{L.rankingEmpty}</Muted> : null}
              <View style={styles.list} testID="vote-ranking">
                {vote.ranking.slice(0, 10).map((r) => (
                  <Plate key={r.applicationId} style={styles.candidate}>
                    <View style={styles.grow}>
                      <Text variant="bodyStrong" color={c.plateInk}>
                        {`${r.rank}. ${r.vehicleLabel}`}
                      </Text>
                      <Text variant="caption" color={c.plateMuted}>
                        {r.pseudo}
                      </Text>
                    </View>
                    <Text variant="bodyStrong" color={c.plateInk}>
                      {L.voiceCount(r.votes)}
                    </Text>
                  </Plate>
                ))}
              </View>
            </>
          ) : null}

          {status.canClose ? (
            <Button
              variant="secondary"
              icon="close"
              onPress={() => setConfirm("close")}
              fullWidth
              testID="vote-detail-close"
            >
              {L.closeNow}
            </Button>
          ) : null}
          {upcoming && canWrite ? (
            <View style={styles.wrap}>
              {vote.kind !== "all_categories" ? (
                <Button
                  variant="plate"
                  icon="edit"
                  onPress={() => router.push(`/evenement/${eventId}/vote-form?vote=${vote.id}`)}
                  testID="vote-detail-edit"
                >
                  {L.edit}
                </Button>
              ) : null}
              <Button
                variant="plate"
                tone="dashed"
                icon="trash"
                onPress={() => setConfirm("remove")}
                testID="vote-detail-remove"
              >
                {L.remove}
              </Button>
            </View>
          ) : null}
        </>
      ) : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space1, padding: space3 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  list: { gap: space2 },
  candidate: { flexDirection: "row", alignItems: "center", gap: space2, padding: space3 },
  grow: { flex: 1, gap: 2 },
  footer: { gap: space2 },
});
