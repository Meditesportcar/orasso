// Temps « Votes du public » de l'assistant (lot R7l2, maquette R7.15 `vp_list`, même étape sur le site) : les votes prévus
// pour l'événement, « Toutes catégories » présent d'office (retirable, remis par « Ajouter »), et « Ajouter un vote » qui
// ouvre la feuille « Nouveau vote » (écran de flux). Chaque vote est enregistré à part par l'API : l'étape n'est jamais
// bloquante pour publier, et elle ne touche pas au brouillon de l'événement.
import { Button, Icon, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { voteOrgaLabels as L, type VoteManageItem, voteConfigLine, voteStatus } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useNow } from "@/lib/useNow";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { OrgaFailure } from "../OrgaGate";
import { useVotesData, voteIcon } from "../votes/useVotesData";
import type { StepContext } from "./types";

const { space1, space2, space3 } = tokens.spacing;

export function VotesTemps({ event }: StepContext) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const at = useNow(60_000);
  const eventId = event?.id ?? "";
  const { manage, zoneName, makeNames, staleMinutes } = useVotesData(eventId, {
    organizer: true,
    enabled: Boolean(event),
  });
  const [menu, setMenu] = useState<string | null>(null);
  const [removing, setRemoving] = useState<VoteManageItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!event) return <Notice testID="wizard-votes-needs-event">{L.needsEvent}</Notice>;
  const items = manage.data?.items ?? [];
  const canWrite = manage.data?.canWrite !== false;

  async function act(action: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await action();
      await manage.reload();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const move = (v: VoteManageItem, delta: -1 | 1) => {
    const ids = items.map((x) => x.id);
    const i = ids.indexOf(v.id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j] as string, ids[i] as string];
    void act(() => api.voteOrder(eventId, ids));
  };

  return (
    <View style={styles.root} testID="wizard-votes">
      <OrgaFailure error={manage.error} />
      {staleMinutes !== null ? <Notice tone="error">{L.staleData(staleMinutes)}</Notice> : null}
      {manage.error && !manage.data ? (
        <>
          <Muted variant="body">{L.loadError}</Muted>
          <Button variant="secondary" icon="undo" onPress={() => void manage.reload()} testID="wizard-votes-retry">
            {L.retry}
          </Button>
        </>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {!manage.data && !manage.error ? <Muted variant="body">{L.loading}</Muted> : null}

      {manage.data ? (
        <>
          <View style={styles.count}>
            <Text variant="bodyStrong" testID="wizard-votes-count">
              {L.count(items.length)}
            </Text>
            <Muted variant="caption">{L.podiumLine(manage.data?.podium)}</Muted>
          </View>
          {items.length === 0 ? <Muted variant="body">{L.empty}</Muted> : null}
          <View style={styles.list}>
            {items.map((v, i) => {
              const open = menu === v.id;
              const status = voteStatus(v, { now: at, published: true, canWrite: false });
              const locked = v.state !== "upcoming";
              return (
                <Plate key={v.id} style={styles.card} testID={`wizard-vote-${v.id}`}>
                  <View style={styles.head}>
                    <View style={[styles.round, { borderColor: v.kind === "all_categories" ? c.accent : c.plateLine }]}>
                      <Icon name={voteIcon(v)} size={18} color={c.plateInk} />
                    </View>
                    <View style={styles.text}>
                      <Text variant="bodyStrong" color={c.plateInk}>
                        {v.title}
                      </Text>
                      <Text variant="caption" color={c.plateMuted}>
                        {locked ? status.text : voteConfigLine(v, at, zoneName, makeNames)}
                      </Text>
                      <Text variant="caption" color={c.plateMuted}>
                        {[v.rareStamp ? L.tagStamp : L.tagTrophy, v.kind === "all_categories" ? L.tagDefault : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </View>
                    {canWrite ? (
                      <Pressable
                        onPress={() => setMenu(open ? null : v.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`${L.menu} : ${v.title}`}
                        accessibilityState={{ expanded: open }}
                        hitSlop={8}
                        style={styles.dots}
                        testID={`wizard-vote-menu-${v.id}`}
                      >
                        <Icon name="more" size={20} color={c.plateInk} />
                      </Pressable>
                    ) : null}
                  </View>
                  {open ? (
                    <View style={styles.actions}>
                      {!locked && v.kind !== "all_categories" ? (
                        <Button
                          variant="plate"
                          icon="edit"
                          onPress={() => router.push(`/evenement/${eventId}/vote-form?vote=${v.id}`)}
                          testID={`wizard-vote-edit-${v.id}`}
                        >
                          {L.edit}
                        </Button>
                      ) : null}
                      {i > 0 ? (
                        <Button variant="plate" icon="up" disabled={busy} onPress={() => move(v, -1)}>
                          {L.moveUp}
                        </Button>
                      ) : null}
                      {i < items.length - 1 ? (
                        <Button variant="plate" icon="down" disabled={busy} onPress={() => move(v, 1)}>
                          {L.moveDown}
                        </Button>
                      ) : null}
                      <Button
                        variant="plate"
                        tone="dashed"
                        icon="trash"
                        disabled={busy}
                        onPress={() => setRemoving(v)}
                        testID={`wizard-vote-remove-${v.id}`}
                      >
                        {L.remove}
                      </Button>
                    </View>
                  ) : null}
                  {removing?.id === v.id ? (
                    <View style={styles.confirm} testID="wizard-vote-remove-confirm">
                      <Text variant="bodyStrong" color={c.plateInk}>
                        {L.removeTitle(v.title)}
                      </Text>
                      <Text variant="caption" color={c.plateMuted}>
                        {L.removeBody}
                      </Text>
                      <View style={styles.actions}>
                        <Button
                          variant="alert"
                          icon="trash"
                          loading={busy}
                          onPress={() =>
                            void act(() => api.voteRemove(eventId, v.id)).then((ok) => {
                              if (ok) {
                                setRemoving(null);
                                setMenu(null);
                              }
                            })
                          }
                          testID="wizard-vote-remove-yes"
                        >
                          {L.removeConfirm}
                        </Button>
                        <Button variant="plate" icon="back" disabled={busy} onPress={() => setRemoving(null)}>
                          {L.keep}
                        </Button>
                      </View>
                    </View>
                  ) : null}
                </Plate>
              );
            })}
          </View>
          {canWrite ? (
            <Button
              variant="secondary"
              icon="add"
              onPress={() => router.push(`/evenement/${eventId}/vote-form`)}
              fullWidth
              testID="wizard-vote-add"
            >
              {L.add}
            </Button>
          ) : null}
        </>
      ) : null}
      <Muted variant="caption">{L.pointsNote(manage.data?.podium)}</Muted>
      <Muted variant="caption">{L.stampNote}</Muted>
      <Muted variant="caption">{L.teamNote}</Muted>
      <Muted variant="caption">{L.stepNotBlocking}</Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space3 },
  count: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space2,
    flexWrap: "wrap",
  },
  list: { gap: space2 },
  card: { gap: space2, padding: space3 },
  head: { flexDirection: "row", alignItems: "center", gap: space2 },
  round: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, gap: 2 },
  dots: { padding: space1 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  confirm: { gap: space2 },
});
