// Onglet Fil du crew (lot R5c1, maquette R5.7 `t-c-page`, données `POSTS`) : le composeur (« Publier », bouton
// principal de l'onglet), puis les publications et les événements automatiques, 20 par page. Réservé aux membres
// actifs : l'API répond 404 à tout autre compte. Composant autonome, monté par la page du crew (onglet Fil, lot R5c2).
// Lot R6a : en direct. Au signal du canal `crew:<id>`, la première page se relit (nouvelles entrées, sorties, arrivées,
// retraits) ; une publication se relit seule (flamme, commentaires, voix). En haut du fil, une nouvelle entrée s'insère ;
// plus bas, une pastille « 1 nouvelle publication » attend, et remonte au toucher (la liste ne saute pas sous le doigt).
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type CrewFeedItem,
  type CrewFeedOuting,
  type CrewFeedPage,
  type CrewLiveNeeds,
  type CrewPostView,
  crewFeedLabels,
  crewLivePillLabel,
  crewPageLabels,
  mergeCrewFeedHead,
} from "@orasso/shared";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePaged } from "@/features/explorer/usePaged";
import { SmButton } from "@/features/passionne/kit";
import { api } from "@/lib/api";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { cacheScope } from "@/lib/kv";
import { createRequestGate } from "@/lib/requestGate";
import { useSession } from "@/lib/session";
import { Avatar } from "@/ui/Avatar";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { Overlay } from "@/ui/Overlay";

import { confirmRemove } from "./confirm";
import { takeCrewFeedDirty } from "./feedSignal";
import { AutoCard, PostCard } from "./PostCard";
import { CommentsSheet, PostMenuSheet } from "./Sheets";
import { useCrewLive } from "./useCrewLive";

export type CrewFeedCrew = { id: string; slug: string; archived?: boolean };

/** Lot R6a : la zone qui défile de la page du crew (la pastille y remonte au haut du fil). */
export type CrewFeedScroller = { scrollTo: (y: number, animated: boolean) => void; y: () => number };

/** Marge sous le haut de l'écran quand la pastille remonte au fil. */
const TOP_MARGIN = tokens.spacing.space3;

export function CrewFeed({ crew, scroller }: { crew: CrewFeedCrew; scroller?: CrewFeedScroller }) {
  const { t, reducedMotion } = useTheme();
  const c = t.color;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { me } = useSession();
  const paged = usePaged<CrewFeedItem>((cursor) => api.crewFeed(crew.id, cursor), [crew.id]);
  // Publications modifiées sur place (flamme, voix, clôture, commentaires) ou retirées (`null`).
  const [changed, setChanged] = useState<Record<string, CrewPostView | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [comments, setComments] = useState<CrewPostView | null>(null);
  const [menu, setMenu] = useState<CrewPostView | null>(null);
  // Lot R5c2 : sorties auxquelles on vient de répondre « Je viens » depuis le fil.
  const [outings, setOutings] = useState<Record<string, CrewFeedOuting>>({});
  // Lot R6a : la dernière première page relue en direct, et les nouvelles entrées acceptées à l'écran.
  const [head, setHead] = useState<CrewFeedPage | null>(null);
  const [accepted, setAccepted] = useState<ReadonlySet<string>>(() => new Set());
  const listRef = useRef<View>(null);
  const liveGate = useRef(createRequestGate(cacheScope)).current;

  const forgetLive = useCallback(() => {
    liveGate.invalidate();
    setHead(null);
    setAccepted(new Set());
  }, [liveGate]);

  // Tour 2 : les changements faits sur place (retrait, voix, flamme) survivent au chargement d'une page suivante ; ils
  // ne s'effacent qu'à une relecture complète du fil (le serveur les reflète alors).
  const reloadPaged = paged.reload;
  const reload = useCallback(async () => {
    await reloadPaged();
    setChanged({});
    setOutings({});
    forgetLive();
  }, [reloadPaged, forgetLive]);
  // Changement de compte : rien de l'ancien compte ne reste.
  const account = cacheScope();
  // biome-ignore lint/correctness/useExhaustiveDependencies: `account` vide les changements.
  useEffect(() => {
    setChanged({});
    setOutings({});
    forgetLive();
  }, [account]);
  // Retour de « Publier dans le crew » : le fil se relit.
  useFocusEffect(
    useCallback(() => {
      if (takeCrewFeedDirty(crew.id)) void reload();
    }, [crew.id, reload]),
  );
  // Lot R6a : une relecture complète du fil (retour sur l'écran, réseau revenu) remplace la première page relue en
  // direct ; une page suivante qui s'ajoute la garde.
  const previous = useRef(paged.items);
  useEffect(() => {
    const before = previous.current;
    const now = paged.items;
    previous.current = now;
    if (!before || !now || before === now) return;
    const appended = now.length >= before.length && before.every((x, i) => now[i]?.key === x.key);
    if (!appended) forgetLive();
  }, [paged.items, forgetLive]);

  const current = (p: CrewPostView) => (p.id in changed ? changed[p.id] : p);
  const put = (p: CrewPostView | null, id: string) => setChanged((m) => ({ ...m, [id]: p }));

  // Le fil affiché : les pages lues, la première page relue en direct par-dessus, sans les nouvelles entrées en attente.
  const view = useMemo(() => {
    const base = paged.items;
    if (!base || !head) return { items: base, pending: [] as CrewFeedItem[] };
    const known = new Set(base.map((i) => i.key));
    const merged = mergeCrewFeedHead(base, head.items, { complete: head.nextCursor === null, insert: true }).items;
    const pending = head.items.filter((i) => !known.has(i.key) && !accepted.has(i.key));
    const hidden = new Set(pending.map((i) => i.key));
    return { items: merged.filter((i) => !hidden.has(i.key)), pending };
  }, [paged.items, head, accepted]);
  const items = view.items;
  const shownPosts = useRef(new Set<string>());
  shownPosts.current = new Set((items ?? []).flatMap((i) => (i.type === "post" ? [i.post.id] : [])));
  const pill = crewLivePillLabel(view.pending);

  /** Le haut du fil est à l'écran (ou plus bas) : une nouvelle entrée peut s'insérer sans faire sauter la liste. */
  const atTop = () =>
    new Promise<boolean>((resolve) => {
      const node = listRef.current;
      if (!node) return resolve(true);
      node.measureInWindow((_x, y) => resolve(!(Number.isFinite(y) && y < insets.top - TOP_MARGIN)));
    });

  const live = async (needs: CrewLiveNeeds) => {
    const ticket = liveGate.start();
    for (const id of needs.removedPosts) put(null, id);
    if (comments && needs.removedPosts.includes(comments.id)) setComments(null);
    if (needs.head) {
      const page = await api.crewFeed(crew.id);
      if (!ticket.current()) return;
      const top = await atTop();
      setHead(page);
      if (top) setAccepted((prev) => new Set([...prev, ...page.items.map((i) => i.key)]));
      // L'état du serveur est plus frais que les changements faits sur place pour les entrées relues.
      const postIds = new Set(page.items.flatMap((i) => (i.type === "post" ? [i.post.id] : [])));
      const outingIds = new Set(page.items.flatMap((i) => (i.type === "crew_outing" ? [i.outing.id] : [])));
      setChanged((m) => Object.fromEntries(Object.entries(m).filter(([id, v]) => v === null || !postIds.has(id))));
      setOutings((m) => Object.fromEntries(Object.entries(m).filter(([id]) => !outingIds.has(id))));
    }
    for (const id of needs.posts) {
      if (needs.removedPosts.includes(id) || !shownPosts.current.has(id)) continue;
      try {
        const post = await api.crewPost(crew.id, id);
        if (ticket.current()) put(post, id);
      } catch (e) {
        if (ticket.current() && e instanceof ApiRequestError && e.status === 404) put(null, id);
      }
    }
  };
  useCrewLive(crew.archived ? null : crew.id, live, { refreshOnFirstSubscribe: true });

  /** La pastille : les nouvelles entrées s'affichent, la page remonte au haut du fil. */
  const showFresh = () => {
    const keys = view.pending.map((i) => i.key);
    const node = listRef.current;
    if (scroller && node) {
      node.measureInWindow((_x, y) => {
        if (Number.isFinite(y))
          scroller.scrollTo(Math.max(0, scroller.y() + y - insets.top - TOP_MARGIN), !reducedMotion);
        setAccepted((prev) => new Set([...prev, ...keys]));
      });
    } else {
      setAccepted((prev) => new Set([...prev, ...keys]));
    }
  };

  async function act(id: string, action: () => Promise<void>) {
    setBusy(id);
    setError(null);
    setOk(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const fire = (p: CrewPostView) =>
    act(p.id, async () => {
      const on = !p.firedByMe;
      put({ ...p, firedByMe: on, firesCount: p.firesCount + (on ? 1 : -1) }, p.id);
      try {
        const state = await api.fireCrewPost(crew.id, p.id, on);
        put({ ...p, ...state }, p.id);
      } catch (e) {
        put(p, p.id);
        throw e;
      }
    });
  const vote = (p: CrewPostView, optionId: string) =>
    act(p.id, async () => put(await api.voteCrewPoll(crew.id, p.id, optionId), p.id));
  const closePoll = (p: CrewPostView) =>
    act(p.id, async () => {
      put(await api.closeCrewPoll(crew.id, p.id), p.id);
      setMenu(null);
      setOk(crewFeedLabels.pollClosedToast);
    });
  const going = (o: CrewFeedOuting) =>
    act(o.id, async () => {
      const v = await api.answerCrewOuting(crew.id, o.id, "yes");
      setOutings((m) => ({ ...m, [o.id]: { ...o, yes: v.yes, maybe: v.maybe, mine: v.mine } }));
      setOk(crewPageLabels.feedOutingYesToast(o.title));
    });
  const remove = async (p: CrewPostView) => {
    if (!(await confirmRemove(crewFeedLabels.removePostConfirm))) return;
    await act(p.id, async () => {
      await api.removeCrewPost(crew.id, p.id);
      put(null, p.id);
      setMenu(null);
      setOk(crewFeedLabels.removed);
    });
  };

  return (
    <View style={styles.feed} testID="crew-feed">
      {!crew.archived ? (
        <View style={[styles.composer, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}>
          <Avatar url={me?.profile.avatarUrl} pseudo={me?.profile.pseudo} size={38} />
          <Text variant="caption" color={c.inkMuted} style={styles.grow}>
            {crewFeedLabels.composerHint}
          </Text>
          <SmButton
            kind="p"
            icon="camera"
            onPress={() => router.push({ pathname: "/crew/publier", params: { crew: crew.slug } })}
            testID="crew-feed-publish"
          >
            {crewFeedLabels.publish}
          </SmButton>
        </View>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {ok ? <Notice>{ok}</Notice> : null}
      <View ref={listRef} collapsable={false} style={styles.list}>
        {paged.error && !items?.length ? (
          <LoadError message={paged.error || crewFeedLabels.loadError} onRetry={() => void reload()} />
        ) : items === null ? (
          <Muted variant="body">…</Muted>
        ) : items.length === 0 ? (
          <Muted variant="body" testID="crew-feed-empty">
            {crewFeedLabels.empty}
          </Muted>
        ) : (
          items.map((item) => {
            if (item.type === "crew_outing") {
              const o = outings[item.outing.id] ?? item.outing;
              return (
                <AutoCard
                  key={item.key}
                  item={{ ...item, outing: o }}
                  busy={busy === o.id}
                  onGoing={crew.archived ? undefined : () => void going(o)}
                />
              );
            }
            if (item.type !== "post") return <AutoCard key={item.key} item={item} />;
            const p = current(item.post);
            if (!p) return null;
            return (
              <PostCard
                key={item.key}
                post={p}
                busy={busy === p.id}
                onFire={() => void fire(p)}
                onComments={() => setComments(p)}
                onMenu={() => setMenu(p)}
                onVote={(optionId) => void vote(p, optionId)}
              />
            );
          })
        )}
      </View>
      {paged.hasMore ? (
        <SmButton
          kind="s"
          wide
          icon="down"
          disabled={paged.loadingMore}
          onPress={() => void paged.loadMore()}
          testID="crew-feed-more"
        >
          {crewFeedLabels.loadMore}
        </SmButton>
      ) : null}
      {paged.error && items?.length ? <LoadError message={paged.error} onRetry={() => void paged.loadMore()} /> : null}
      {pill ? (
        <Overlay>
          <View style={[styles.pillZone, { top: insets.top + TOP_MARGIN }]} pointerEvents="box-none">
            <SmButton
              kind="k"
              icon="up"
              onPress={showFresh}
              accessibilityLabel={crewFeedLabels.newA11y(pill)}
              style={[styles.pill, { boxShadow: t.shadow.shadowCard }]}
              testID="crew-feed-new"
            >
              {pill}
            </SmButton>
          </View>
        </Overlay>
      ) : null}
      <CommentsSheet
        crewId={crew.id}
        post={comments}
        onClose={() => setComments(null)}
        onCount={(id, delta) => {
          const base = items?.find((x) => x.type === "post" && x.post.id === id);
          const p = base?.type === "post" ? current(base.post) : null;
          if (p) put({ ...p, commentsCount: Math.max(0, p.commentsCount + delta) }, id);
        }}
      />
      <PostMenuSheet
        post={menu}
        busy={busy !== null}
        onClose={() => setMenu(null)}
        onRemove={(p) => void remove(p)}
        onClosePoll={(p) => void closePoll(p)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  feed: { gap: tokens.spacing.space3 },
  list: { gap: tokens.spacing.space3 },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.space2 + 2,
    padding: tokens.spacing.space2 + 2,
    borderRadius: tokens.radius.radiusLg - 2,
  },
  grow: { flex: 1, minWidth: 0 },
  // La pastille des nouveautés, posée en haut de l'écran (zone des feuilles), centrée.
  pillZone: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 30 },
  pill: { borderRadius: tokens.radius.radiusPill },
});
