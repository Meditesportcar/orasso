// L'Activité, derrière la cloche (lot R7c2, D38 ; maquette R7.2 `n-act`) : ce qui te concerne, rien d'autre. Les nouvelles
// des autres vont au Fil, les conversations dans la bulle (Messages). En tête la ligne repliée « Demandes · 3 » (page
// `activite/demandes`), puis le bandeau moutarde des changements d'horaire, puis « Aujourd'hui », « Cette semaine »,
// « Plus tôt », une ligne par groupe (« Kenji_66 et 4 autres ont aimé ta story »).
// Ouvrir l'écran pose « vu » (`POST /me/activity/seen` : la pastille de la cloche tombe) ; toucher une ligne la marque lue
// (`POST /me/notifications/read` avec ses `ids`). Mise à jour en direct par le canal `user:{id}`. Une panne n'est pas une
// liste vide (« Réessayer »).
import { Icon, Text, tokens, useTheme, withAlpha } from "@orasso/design-system/native";
import {
  type ActivityDay,
  type ActivityGroup,
  type ActivityItem,
  type ActivityPage,
  publicationLinkOf,
  type RequestItem,
  requestCountSpoken,
  requestCountText,
  requestRowCounts,
  requestRowShown,
  SET_OUTLOOK_UNCERTAIN_ACTION,
} from "@orasso/shared";
import { useIsFocused, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { SmallButton } from "@/features/sorties/bits";
import { adminLinkOf } from "@/lib/adminModel";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { appLinkOf, teamRequestTarget } from "@/lib/links";
import { usePersona } from "@/lib/persona";
import { useChannel } from "@/lib/realtime";
import { createSeenGate } from "@/lib/seenGate";
import { useSession } from "@/lib/session";
import { useTail } from "@/lib/tailPages";
import { useApi } from "@/lib/useApi";
import { Avatar } from "@/ui/Avatar";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

import { ActivityLine } from "./ActivityRow";
import { AlbumTaggedRow } from "./rows/AlbumTagged";
import { StoryMentionRow } from "./rows/StoryMention";
import { UncertainAction } from "./UncertainAction";

const { space2, space3 } = tokens.spacing;

const DAY_LABELS: Record<ActivityDay, string> = { today: "Aujourd'hui", week: "Cette semaine", earlier: "Plus tôt" };

/** Fusionne la page suivante dans les groupes déjà lus (même période = même carte). */
export function mergeGroups(a: ActivityGroup[], b: ActivityGroup[]): ActivityGroup[] {
  const by = new Map<ActivityDay, ActivityItem[]>();
  for (const g of [...a, ...b]) by.set(g.day, [...(by.get(g.day) ?? []), ...g.items]);
  return (["today", "week", "earlier"] as const).flatMap((day) => {
    const items = by.get(day);
    return items ? [{ day, items }] : [];
  });
}

export function ActivityScreen() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { me, refreshMe } = useSession();
  const { choose } = usePersona();
  const focused = useIsFocused();
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  const activity = useApi<ActivityPage>(() => api.activity(), []);
  const summary = useApi(() => api.inboxSummary(), []);
  const requests = useApi(() => api.requests(), []);
  // Lignes touchées : lues tout de suite à l'écran, sans attendre la relecture.
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(new Set());
  const page = activity.data;
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  // Les pages suivantes : une première page relue les oublie, une réponse dépassée est rejetée (tour 2).
  const fetchMore = useCallback(async (cursor: string) => {
    const next = await api.activity(cursor);
    return { items: next.groups, nextCursor: next.nextCursor };
  }, []);
  const tail = useTail<ActivityGroup>(page, page?.nextCursor ?? null, fetchMore, errorMessage);

  // « Vu » (tour 2) : seulement avec le focus et après une lecture réussie ; une notification reçue pendant qu'une fiche est
  // ouverte par-dessus reste due jusqu'au retour sur l'Activité.
  const gate = useRef(createSeenGate()).current;
  const markSeen = useCallback(() => {
    void api
      .markActivitySeen()
      .then(() => Promise.all([refreshMe(), summary.reload()]))
      .catch(() => gate.owe());
  }, [refreshMe, summary.reload, gate]);
  const settleSeen = useCallback(
    (ok: boolean) => {
      if (gate.settle({ ok, focused: focusedRef.current })) markSeen();
    },
    [gate, markSeen],
  );
  // Une liste lue (ouverture, relecture) : « vu » si l'écran est devant.
  // biome-ignore lint/correctness/useExhaustiveDependencies: une lecture réussie = une nouvelle première page
  useEffect(() => {
    if (page) settleSeen(true);
  }, [page]);
  // Retour sur l'Activité avec un « vu » dû : la liste est relue d'abord.
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
    // Une notification arrive : elle est vue si l'écran est devant et la liste relue, sinon au retour.
    if (event.type === "notification") {
      gate.owe();
      void reloadAll().then((list) => settleSeen(list !== null));
    }
  });

  // Les horaires modifiés sont en tête (bandeau) : ils ne reviennent pas dans les groupes.
  const highlighted = page?.highlighted ?? [];
  const highlightedIds = new Set(highlighted.flatMap((h) => h.ids));
  const groups = mergeGroups(page?.groups ?? [], tail.items)
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.ids.some((id) => highlightedIds.has(id))) }))
    .filter((g) => g.items.length > 0);
  const nextCursor = tail.nextCursor;
  const isRead = (i: ActivityItem) => i.read || i.ids.every((id) => readIds.has(id));

  // Compteur inconnu (résumé et liste en échec **tous les deux**) ≠ zéro : la ligne reste, sans nombre, avec « Réessayer ».
  // Avant la première réponse, la ligne attend, sans erreur (tour 3).
  const { activityRequests, atLeast, status } = requestRowCounts(summary.data, requests.data, {
    summary: Boolean(summary.error),
    list: Boolean(requests.error),
  });
  const requestItems = (requests.data?.items ?? []).filter((r) => r.kind !== "contact");

  async function open(item: ActivityItem) {
    if (!isRead(item)) {
      setReadIds((s) => new Set([...s, ...item.ids]));
      void api
        .markNotificationsReadIds(item.ids)
        .then(() => refreshMe())
        .catch(() => undefined);
    }
    const team = teamRequestTarget(item.data);
    const admin = adminLinkOf(item.data.link);
    const link = publicationLinkOf(item.data) ?? appLinkOf(item.data.link);
    if (team) choose({ kind: "organizer", structureId: team }, "/(orga)/equipe");
    else if (admin) choose({ kind: "admin" }, admin);
    else if (link) router.push(link as never);
  }
  const hasLink = (item: ActivityItem) =>
    Boolean(
      teamRequestTarget(item.data) ||
        adminLinkOf(item.data.link) ||
        publicationLinkOf(item.data) ||
        appLinkOf(item.data.link),
    );

  const empty = page && groups.length === 0 && highlighted.length === 0 && activityRequests === 0;
  const countFailed = status === "failed";
  const rowShown = requestRowShown(activityRequests, status);

  return (
    <FlowScreen title="Activité" facts="Ce qui te concerne" onClose={close} onRefresh={reloadAll} closeLabel="Retour">
      {activity.error && !page ? (
        <LoadError message={activity.error.message} onRetry={() => void activity.reload()} />
      ) : null}
      {activity.offline ? <Notice>Hors ligne : dernière liste connue.</Notice> : null}

      {countFailed ? (
        <LoadError
          message="Le nombre de demandes n'a pas pu être lu."
          onRetry={() => void Promise.all([summary.reload(), requests.reload()])}
        />
      ) : null}
      {rowShown ? (
        <Pressable
          onPress={() => router.push("/activite/demandes")}
          accessibilityRole="link"
          accessibilityLabel={
            activityRequests === null ? "Demandes" : `Demandes, ${requestCountSpoken(activityRequests, atLeast)}`
          }
          style={[styles.requestsRow, { backgroundColor: c.surface }]}
          testID="activity-requests-row"
        >
          <View style={styles.avatars}>
            {requestItems.slice(0, 3).map((r, i) => {
              const from =
                r.from.type === "person"
                  ? { name: r.from.pseudo, url: r.from.avatarUrl }
                  : { name: r.from.name, url: r.from.logoUrl };
              return (
                <View
                  key={`${r.kind}:${r.id}`}
                  style={[styles.avatarOver, { marginLeft: i === 0 ? 0 : -12, borderColor: c.surface }]}
                >
                  <Avatar url={from.url} pseudo={from.name} size={32} />
                </View>
              );
            })}
          </View>
          <View style={styles.text}>
            <Text variant="bodyStrong" color={c.ink}>
              {activityRequests === null ? "Demandes" : `Demandes · ${requestCountText(activityRequests, atLeast)}`}
            </Text>
            {requestItems[0] && activityRequests !== null ? (
              <Text variant="caption" color={c.inkMuted} numberOfLines={2}>
                {requestSummary(requestItems[0], activityRequests)}
              </Text>
            ) : null}
          </View>
          <Icon name="next" size={20} color={c.ink} />
        </Pressable>
      ) : null}

      {highlighted.map((h) => (
        <View
          key={h.id}
          style={[styles.band, { borderColor: c.accent, backgroundColor: withAlpha(c.accent, 0.12) }]}
          testID="activity-highlight"
        >
          <Icon name="calendar" size={20} color={c.accentText} />
          <View style={styles.text}>
            <Text variant="label" color={c.accentText}>
              Changement d'horaire
            </Text>
            <Text variant="bodyStrong" color={c.ink}>
              {h.title}
            </Text>
            {h.body ? (
              <Text variant="caption" color={c.inkMuted}>
                {h.body}
              </Text>
            ) : null}
            {hasLink(h) ? (
              <View style={styles.bandAction}>
                <SmallButton icon="next" onPress={() => void open(h)} testID="activity-highlight-open">
                  Voir la fiche
                </SmallButton>
              </View>
            ) : null}
          </View>
        </View>
      ))}

      {groups.map((g) => (
        <View key={g.day} style={styles.group} testID={`activity-${g.day}`}>
          <Muted variant="label" accessibilityRole="header">
            {DAY_LABELS[g.day]}
          </Muted>
          <View style={[styles.card, { backgroundColor: c.surface }]}>
            {g.items.map((item, i) => {
              const read = isRead(item);
              const shown = read === item.read ? item : { ...item, read };
              const press = hasLink(item) ? () => void open(item) : !read ? () => void open(item) : undefined;
              const asksUncertain =
                item.data.action === SET_OUTLOOK_UNCERTAIN_ACTION && typeof item.data.eventId === "string";
              return (
                <View key={item.id} style={i > 0 ? [styles.divider, { borderTopColor: c.line }] : null}>
                  {item.type === "story_mention" ? (
                    <StoryMentionRow item={shown} day={g.day} onPress={press} />
                  ) : item.type === "album_tagged" ? (
                    <AlbumTaggedRow item={shown} day={g.day} onPress={press} />
                  ) : (
                    <ActivityLine item={shown} day={g.day} onPress={press} />
                  )}
                  {asksUncertain ? (
                    <View style={styles.action}>
                      <UncertainAction eventId={String(item.data.eventId)} />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      ))}

      {tail.error ? <Notice tone="error">{tail.error}</Notice> : null}
      {nextCursor ? (
        <SmallButton icon="down" disabled={tail.busy} onPress={() => void tail.more()} testID="activity-more">
          Voir plus
        </SmallButton>
      ) : null}
      {empty ? <Muted variant="body">Rien de neuf pour le moment.</Muted> : null}
      {!page && activity.loading ? <Muted variant="body">Chargement…</Muted> : null}
      <Muted variant="caption" style={styles.note}>
        Les nouvelles des autres sont dans le Fil, les conversations dans Messages.
      </Muted>
    </FlowScreen>
  );
}

/** « Côte Vermeille Classic t'invite, et 2 autres » : la demande la plus récente, puis le reste. */
function requestSummary(first: RequestItem, total: number): string {
  const who = first.from.type === "person" ? first.from.pseudo : first.from.name;
  return total > 1
    ? `${who} et ${total - 1} autre${total - 1 > 1 ? "s" : ""} attendent ta réponse`
    : `${who} attend ta réponse`;
}

const styles = StyleSheet.create({
  requestsRow: { flexDirection: "row", alignItems: "center", gap: space3, padding: space3, borderRadius: 16 },
  avatars: { flexDirection: "row", alignItems: "center" },
  avatarOver: { borderWidth: 2, borderRadius: 18 },
  text: { flex: 1, gap: 2 },
  band: { flexDirection: "row", gap: space3, padding: space3, borderRadius: 16, borderWidth: 1 },
  bandAction: { flexDirection: "row", paddingTop: space2 },
  group: { gap: space2 },
  card: { borderRadius: 16, overflow: "hidden" },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  action: { paddingHorizontal: space3, paddingBottom: space3, gap: 6 },
  note: { paddingTop: space2 },
});
