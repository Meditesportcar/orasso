// « Activité · <structure> » (lot R9d, maquette R9.4 `n-cloche`) : la cloche de la casquette organisateur. Mes lignes de cette
// structure seulement (une par responsable : un co-organisateur ne voit jamais celles de l'autre), chips « Tout · À trier ·
// Mentions · Commentaires · Collaborations », la ligne « Demandes · N » (staff et collaborations) en tête, puis « Aujourd'hui ·
// Cette semaine · Plus tôt » (les groupes de la cloche personnelle). Chaque ligne ouvre sa cible : « À trier » → le Tri de
// l'événement, mention ou commentaire → la publication, collaboration → la demande, staff → l'Équipe.
// Ouvrir l'écran pose « vu » (`POST /structures/:id/activity/seen`) ; toucher une ligne la marque lue
// (`POST /me/notifications/read` avec ses `ids`). Une panne n'est pas une liste vide (« Réessayer »).
import { Chip, ChipRow, Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type ActivityGroup,
  type ActivityItem,
  type ActivityPage,
  structureActivityLabels as L,
  publicationLinkOf,
  type StructureActivityFilter,
  structureActivityFilters,
} from "@orasso/shared";
import { useIsFocused, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { OrgaGate, useOrga } from "@/features/orga/OrgaGate";
import { SmallButton } from "@/features/sorties/bits";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useChannel } from "@/lib/realtime";
import { createSeenGate } from "@/lib/seenGate";
import { useSession } from "@/lib/session";
import { useTail } from "@/lib/tailPages";
import { useApi } from "@/lib/useApi";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

import { ActivityLine } from "../ActivityRow";
import { mergeGroups } from "../ActivityScreen";
import { StructureRequests } from "./StructureRequests";

const { space2, space3 } = tokens.spacing;

const DAY_LABELS = { today: L.today, week: L.week, earlier: L.earlier } as const;

/** Où mène une ligne de l'Activité de la structure (la cible dépend du type, pas d'un lien stocké). */
export type StructureTarget =
  | { kind: "triage"; eventId: string }
  | { kind: "path"; path: string }
  | { kind: "team" }
  | { kind: "requests" }
  | null;

export function structureTargetOf(item: Pick<ActivityItem, "type" | "data">): StructureTarget {
  const d = item.data;
  if (item.type === "application_received" && typeof d.eventId === "string") {
    return { kind: "triage", eventId: d.eventId };
  }
  if (item.type === "staff_request") return { kind: "team" };
  if (item.type === "coauthor_invited") return { kind: "requests" };
  const post = publicationLinkOf(d);
  return post ? { kind: "path", path: post } : null;
}

export function StructureActivityScreen() {
  return (
    <OrgaGate title={L.title}>
      <Body />
    </OrgaGate>
  );
}

function Body() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { me, refreshMe } = useSession();
  const { structureId, structureName } = useOrga();
  const focused = useIsFocused();
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  const [filter, setFilter] = useState<StructureActivityFilter>("all");
  const [showRequests, setShowRequests] = useState(false);
  const activity = useApi<ActivityPage>(() => api.structureActivity(structureId, filter), [structureId, filter]);
  const summary = useApi(() => api.orgInboxSummary(structureId), [structureId]);
  const requests = useApi(() => api.structureRequests(structureId), [structureId]);
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(new Set());
  const page = activity.data;
  const close = () => (router.canGoBack() ? router.back() : router.replace("/(orga)/direct"));

  const fetchMore = useCallback(
    async (cursor: string) => {
      const next = await api.structureActivity(structureId, filter, cursor);
      return { items: next.groups, nextCursor: next.nextCursor };
    },
    [structureId, filter],
  );
  const tail = useTail<ActivityGroup>(page, page?.nextCursor ?? null, fetchMore, errorMessage);

  // « Vu » : seulement avec le focus et après une lecture réussie ; une notification reçue pendant qu'une fiche est ouverte
  // par-dessus reste due jusqu'au retour sur l'écran.
  const gate = useRef(createSeenGate()).current;
  const markSeen = useCallback(() => {
    void api
      .markStructureActivitySeen(structureId)
      .then(() => Promise.all([refreshMe(), summary.reload()]))
      .catch(() => gate.owe());
  }, [structureId, refreshMe, summary.reload, gate]);
  const settleSeen = useCallback(
    (ok: boolean) => {
      if (gate.settle({ ok, focused: focusedRef.current })) markSeen();
    },
    [gate, markSeen],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: une lecture réussie = une nouvelle première page
  useEffect(() => {
    if (page) settleSeen(true);
  }, [page]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: au changement de focus seulement
  useEffect(() => {
    if (focused && page && gate.owed()) void activity.reload().then((r) => settleSeen(r !== null));
  }, [focused]);

  const reloadAll = useCallback(async () => {
    const [list] = await Promise.all([activity.reload(), summary.reload(), requests.reload(), refreshMe()]);
    return list;
  }, [activity.reload, summary.reload, requests.reload, refreshMe]);

  useChannel(me ? `user:${me.user.id}` : null, (event) => {
    if (event.type === "inbox.changed") void reloadAll();
    if (event.type === "notification") {
      gate.owe();
      void reloadAll().then((list) => settleSeen(list !== null));
    }
  });

  const groups = mergeGroups(page?.groups ?? [], tail.items);
  const isRead = (i: ActivityItem) => i.read || i.ids.every((id) => readIds.has(id));
  const requestsTotal = requests.data?.total ?? 0;
  const empty = page && groups.length === 0 && requestsTotal === 0;

  async function open(item: ActivityItem) {
    if (!isRead(item)) {
      setReadIds((s) => new Set([...s, ...item.ids]));
      void api
        .markNotificationsReadIds(item.ids)
        .then(() => Promise.all([refreshMe(), summary.reload()]))
        .catch(() => undefined);
    }
    const target = structureTargetOf(item);
    if (!target) return;
    if (target.kind === "triage") router.push({ pathname: "/tri", params: { event: target.eventId } });
    else if (target.kind === "team") router.navigate("/(orga)/equipe");
    else if (target.kind === "requests") setShowRequests(true);
    else router.push(target.path as never);
  }

  return (
    <FlowScreen title={L.title} facts={structureName} onClose={close} onRefresh={reloadAll} closeLabel="Retour">
      <ChipRow accessibilityRole="tablist">
        {structureActivityFilters.map((f) => (
          <Chip key={f} accessibilityRole="tab" selected={filter === f} onPress={() => setFilter(f)}>
            {L.chips[f]}
          </Chip>
        ))}
      </ChipRow>

      {activity.error && !page ? <LoadError message={L.loadError} onRetry={() => void activity.reload()} /> : null}
      {activity.offline ? <Notice>Hors ligne : dernière liste connue.</Notice> : null}

      {requestsTotal > 0 && filter === "all" ? (
        <>
          <Pressable
            onPress={() => setShowRequests((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showRequests }}
            accessibilityLabel={`${L.requests}, ${requestsTotal} en attente`}
            style={[styles.requestsRow, { backgroundColor: c.surface }]}
            testID="sact-requests-row"
          >
            <View style={styles.text}>
              <Text variant="bodyStrong" color={c.ink}>
                {`${L.requests} · ${requestsTotal}`}
              </Text>
            </View>
            <Icon name={showRequests ? "up" : "down"} size={20} color={c.ink} />
          </Pressable>
          {showRequests ? (
            <StructureRequests
              structureId={structureId}
              items={requests.data?.items ?? []}
              onDone={() => void Promise.all([requests.reload(), summary.reload(), refreshMe()])}
            />
          ) : null}
        </>
      ) : null}

      {groups.map((g) => (
        <View key={g.day} style={styles.group} testID={`sact-${g.day}`}>
          <Muted variant="label" accessibilityRole="header">
            {DAY_LABELS[g.day]}
          </Muted>
          <View style={[styles.card, { backgroundColor: c.surface }]}>
            {g.items.map((item, i) => {
              const read = isRead(item);
              const shown = read === item.read ? item : { ...item, read };
              return (
                <View key={item.id} style={i > 0 ? [styles.divider, { borderTopColor: c.line }] : null}>
                  <ActivityLine item={shown} day={g.day} onPress={() => void open(item)} />
                </View>
              );
            })}
          </View>
        </View>
      ))}

      {tail.error ? <Notice tone="error">{tail.error}</Notice> : null}
      {tail.nextCursor ? (
        <SmallButton icon="down" disabled={tail.busy} onPress={() => void tail.more()} testID="sact-more">
          Voir plus
        </SmallButton>
      ) : null}
      {empty ? <Muted variant="body">{L.empty(structureName)}</Muted> : null}
      {!page && activity.loading ? <Muted variant="body">Chargement…</Muted> : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  requestsRow: { flexDirection: "row", alignItems: "center", gap: space3, padding: space3, borderRadius: 16 },
  text: { flex: 1, gap: 2 },
  group: { gap: space2 },
  card: { borderRadius: 16, overflow: "hidden" },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
});
