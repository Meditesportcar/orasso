// « Votes » pendant l'événement (lot R7l2, maquette R7.16 `v-live`) : chaque vote avec son état (« Ouvert · 34 voix · ferme
// mardi à 23 h », « Prévu · dimanche 16 h », « Prêt à lancer ») et ses actions, « Lancer le vote » et « Clore maintenant »
// (avec confirmation). Dans l'espace organisateur, propriétaire et co-organisateurs lancent et closent ; en mode staff, la
// même liste est en lecture seule (aucun bouton : l'API répond 403 aux écritures du staff). Temps réel : canal
// `event:{id}:votes`.
import { Button, Icon, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  voteOrgaLabels as L,
  type VoteManageItem,
  type VoteStatus,
  type VoteStatusTone,
  voteStatus,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useNow } from "@/lib/useNow";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";
import { ConfirmSheet } from "../ConfirmSheet";
import { OrgaFailure } from "../OrgaGate";
import { useVotesData, voteIcon } from "./useVotesData";

const { space1, space2, space3 } = tokens.spacing;

type Pending = { kind: "launch" | "close"; vote: VoteManageItem };

/** L'écran de l'espace organisateur : l'événement doit être celui de la casquette ouverte. */
export function OrgaVotes({ eventId }: { eventId: string }) {
  return <VotesScreen eventId={eventId} readOnly={false} />;
}

export function VotesScreen({ eventId, readOnly }: { eventId: string; readOnly: boolean }) {
  const router = useRouter();
  const at = useNow(30_000);
  const { manage, event, staleMinutes } = useVotesData(eventId, { organizer: !readOnly });
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const items = manage.data?.items ?? [];
  // Le staff ne reçoit jamais le droit d'écrire (`canWrite` de l'API) ; l'écran le suit, sans le deviner.
  const canWrite = !readOnly && manage.data?.canWrite === true;
  const published = readOnly ? true : event.data?.status === "published";
  const close = () =>
    router.canGoBack() ? router.back() : router.replace(readOnly ? `/staff/${eventId}` : `/evenement/${eventId}`);

  const statuses = items.map((v) => voteStatus(v, { now: at, published, canWrite }));
  // Un seul bouton principal par écran : le premier vote prêt à lancer.
  const hot = items.findIndex((_, i) => statuses[i]?.canLaunch && !statuses[i]?.launchBlocked);

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      if (pending.kind === "launch") await api.voteOpen(eventId, pending.vote.id);
      else await api.voteClose(eventId, pending.vote.id);
      setNotice(pending.kind === "launch" ? L.launched : L.closed);
      setPending(null);
      await manage.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FlowScreen
      title={L.screenTitle}
      facts={readOnly ? undefined : event.data?.title}
      onClose={close}
      onRefresh={async () => {
        await Promise.all([manage.reload(), readOnly ? null : event.reload()]);
      }}
      overlays={
        pending ? (
          <ConfirmSheet
            visible
            title={pending.kind === "launch" ? L.launchTitle(pending.vote.title) : L.closeTitle(pending.vote.title)}
            body={pending.kind === "launch" ? L.launchBody : L.closeBody}
            confirmLabel={pending.kind === "launch" ? L.launchConfirm : L.closeConfirm}
            confirmIcon={pending.kind === "launch" ? "spark" : "close"}
            cancelLabel={L.cancel}
            busy={busy}
            error={error}
            onConfirm={() => void confirm()}
            onClose={() => {
              setPending(null);
              setError(null);
            }}
          />
        ) : null
      }
    >
      {!readOnly ? <OrgaFailure error={manage.error} /> : null}
      {staleMinutes !== null ? <Notice tone="error">{L.staleData(staleMinutes)}</Notice> : null}
      {readOnly && manage.error ? <Notice tone="error">{errorMessage(manage.error)}</Notice> : null}
      {error && !pending ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice testID="votes-notice">{notice}</Notice> : null}
      {!manage.data && !manage.error ? <Muted variant="body">{L.loading}</Muted> : null}
      {manage.error ? (
        <Button variant="secondary" icon="undo" onPress={() => void manage.reload()} testID="votes-retry">
          {L.retry}
        </Button>
      ) : null}
      {manage.data && items.length === 0 ? <Muted variant="body">{L.empty2}</Muted> : null}

      <View style={styles.list} testID="votes-screen">
        {items.map((v, i) => {
          const status = statuses[i] as VoteStatus;
          return (
            <VoteCard
              key={v.id}
              vote={v}
              status={status}
              primary={i === hot}
              onOpen={readOnly ? undefined : () => router.push(`/evenement/${eventId}/vote-detail?vote=${v.id}`)}
              onLaunch={() => setPending({ kind: "launch", vote: v })}
              onClose={() => setPending({ kind: "close", vote: v })}
            />
          );
        })}
      </View>

      {canWrite ? (
        <Button
          variant="secondary"
          icon="add"
          onPress={() => router.push(`/evenement/${eventId}/vote-form`)}
          fullWidth
          testID="votes-add"
        >
          {L.addVoteOnScreen}
        </Button>
      ) : null}
      <Muted variant="caption">{L.bell}</Muted>
      <Muted variant="caption">{readOnly || !canWrite ? L.staffReadOnly : L.teamNote}</Muted>
    </FlowScreen>
  );
}

function toneColor(tone: VoteStatusTone, c: ReturnType<typeof useTheme>["t"]["color"]): string {
  return tone === "open" || tone === "ready" ? c.accent : tone === "plan" ? c.plateMuted : c.inkFaint;
}

function VoteCard({
  vote,
  status,
  primary,
  onOpen,
  onLaunch,
  onClose,
}: {
  vote: VoteManageItem;
  status: VoteStatus;
  primary: boolean;
  onOpen?: () => void;
  onLaunch: () => void;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const head = (
    <View style={styles.head}>
      <View style={[styles.round, { borderColor: vote.kind === "all_categories" ? c.accent : c.plateLine }]}>
        <Icon name={voteIcon(vote)} size={18} color={c.plateInk} />
      </View>
      <View style={styles.text}>
        <Text variant="bodyStrong" color={c.plateInk}>
          {vote.title}
        </Text>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: toneColor(status.tone, t.color) }]} />
          <Text variant="caption" color={c.plateMuted} style={styles.statusText} testID={`vote-status-${vote.id}`}>
            {status.text}
          </Text>
        </View>
      </View>
    </View>
  );
  return (
    <Plate style={styles.card} testID={`vote-card-${vote.id}`}>
      {onOpen ? (
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={`${vote.title} : ${status.text}`}
          testID={`vote-open-${vote.id}`}
        >
          {head}
        </Pressable>
      ) : (
        head
      )}
      {status.canLaunch ? (
        <>
          <Button
            variant={primary ? "primary" : "secondary"}
            icon="spark"
            onPress={onLaunch}
            disabled={Boolean(status.launchBlocked)}
            fullWidth
            testID={`vote-launch-${vote.id}`}
          >
            {L.launch}
          </Button>
          {status.launchBlocked ? (
            <Text variant="caption" color={c.plateMuted}>
              {status.launchBlocked}
            </Text>
          ) : null}
        </>
      ) : null}
      {status.canClose ? (
        <Button variant="secondary" icon="close" onPress={onClose} fullWidth testID={`vote-close-${vote.id}`}>
          {L.closeNow}
        </Button>
      ) : null}
    </Plate>
  );
}

const styles = StyleSheet.create({
  list: { gap: space2 },
  card: { gap: space2, padding: space3 },
  head: { flexDirection: "row", alignItems: "center", gap: space2 },
  round: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, gap: 2 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: space1 },
  statusText: { flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
