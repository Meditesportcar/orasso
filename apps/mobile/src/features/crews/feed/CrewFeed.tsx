// Onglet Fil du crew (lot R5c1, maquette R5.7 `t-c-page`, données `POSTS`) : le composeur (« Publier », bouton
// principal de l'onglet), puis les publications et les événements automatiques, 20 par page. Réservé aux membres
// actifs : l'API répond 404 à tout autre compte. Composant autonome, monté par la page du crew (onglet Fil, lot R5c2).
// Lot R6a : en direct. Au signal du canal `crew:<id>`, le haut du fil se relit (nouvelles entrées, arrivées, retraits) ;
// une publication ou une sortie se relit seule (flamme, commentaires, voix, réponses), où qu'elle soit. En haut du fil,
// une nouvelle entrée s'insère ; plus bas, une pastille « 1 nouvelle publication » attend, et remonte au toucher (la
// liste ne saute pas sous le doigt). Tour 2 : le fil affiché, son curseur et les nouveautés tiennent dans un seul état
// (`useCrewFeedList`) ; une relecture en échec se retente, et une ligne discrète le dit.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  acceptCrewFeedPending,
  type CrewFeedOuting,
  type CrewLiveNeeds,
  type CrewPostView,
  crewFeedLabels,
  crewLivePillLabel,
  crewPageLabels,
} from "@orasso/shared";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SmButton } from "@/features/passionne/kit";
import { api } from "@/lib/api";
import { ApiRequestError, errorMessage } from "@/lib/http";
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
import { useCrewFeedList } from "./useCrewFeedList";
import { useCrewLive } from "./useCrewLive";

export type CrewFeedCrew = { id: string; slug: string; archived?: boolean };

/** Lot R6a : la zone qui défile de la page du crew (la pastille y remonte au haut du fil). */
export type CrewFeedScroller = { scrollTo: (y: number, animated: boolean) => void; y: () => number };

/** Marge sous le haut de l'écran quand la pastille remonte au fil. */
const TOP_MARGIN = tokens.spacing.space3;

const notFound = (e: unknown) => e instanceof ApiRequestError && e.status === 404;

export function CrewFeed({ crew, scroller }: { crew: CrewFeedCrew; scroller?: CrewFeedScroller }) {
  const { t, reducedMotion } = useTheme();
  const c = t.color;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { me } = useSession();
  const feed = useCrewFeedList(crew.id);
  const { putPost, putOuting } = feed;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [comments, setComments] = useState<CrewPostView | null>(null);
  const [menu, setMenu] = useState<CrewPostView | null>(null);
  const listRef = useRef<View>(null);

  // Retour de « Publier dans le crew » : le fil se relit.
  const reload = feed.reload;
  useFocusEffect(
    useCallback(() => {
      if (takeCrewFeedDirty(crew.id)) void reload();
    }, [crew.id, reload]),
  );

  const items = feed.items;
  // Ce qui est à l'écran ou en attente : seules ces publications et sorties se relisent à un signal.
  const shown = useRef({ posts: new Set<string>(), outings: new Set<string>() });
  const everything = [...(items ?? []), ...feed.pending];
  shown.current = {
    posts: new Set(everything.flatMap((i) => (i.type === "post" ? [i.post.id] : []))),
    outings: new Set(everything.flatMap((i) => (i.type === "crew_outing" ? [i.outing.id] : []))),
  };
  const pill = crewLivePillLabel(feed.pending);

  /** Le haut du fil est à l'écran (ou plus bas) : une nouvelle entrée peut s'insérer sans faire sauter la liste. */
  const atTop = () =>
    new Promise<boolean>((resolve) => {
      const node = listRef.current;
      if (!node) return resolve(true);
      node.measureInWindow((_x, y) => resolve(!(Number.isFinite(y) && y < insets.top - TOP_MARGIN)));
    });

  const live = async (needs: CrewLiveNeeds) => {
    for (const id of needs.removedPosts) putPost(id, null);
    for (const id of needs.removedOutings) putOuting(id, null);
    if (comments && needs.removedPosts.includes(comments.id)) setComments(null);
    // Le haut du fil (un signal) ou toutes les pages chargées (reconnexion) : un échec rejette, le besoin est retenté.
    const read = needs.head || needs.full ? await feed.live(needs.full ? "full" : "head", atTop) : [];
    const readPosts = new Set(read.flatMap((i) => (i.type === "post" ? [i.post.id] : [])));
    const readOutings = new Set(read.flatMap((i) => (i.type === "crew_outing" ? [i.outing.id] : [])));
    for (const id of needs.posts) {
      if (needs.removedPosts.includes(id) || readPosts.has(id) || !shown.current.posts.has(id)) continue;
      try {
        putPost(id, await api.crewPost(crew.id, id));
      } catch (e) {
        if (!notFound(e)) throw e;
        putPost(id, null);
      }
    }
    // Tour 2 : la carte d'une sortie modifiée ou répondue se relit, où qu'elle soit dans le fil.
    for (const id of needs.outings) {
      if (needs.removedOutings.includes(id) || readOutings.has(id) || !shown.current.outings.has(id)) continue;
      try {
        const o = await api.crewOuting(crew.id, id);
        putOuting(id, (cur) => ({
          ...cur,
          title: o.title,
          startsAt: o.startsAt,
          place: o.place,
          yes: o.yes,
          maybe: o.maybe,
          mine: o.mine,
          open: o.open,
        }));
      } catch (e) {
        if (!notFound(e)) throw e;
        putOuting(id, null);
      }
    }
  };
  const { stale } = useCrewLive(crew.archived ? null : crew.id, live, { refreshOnFirstSubscribe: true });

  /** La pastille : les nouvelles entrées s'affichent, la page remonte au haut du fil. */
  const showFresh = () => {
    const node = listRef.current;
    const accept = () => feed.acceptPending(acceptCrewFeedPending);
    if (scroller && node) {
      node.measureInWindow((_x, y) => {
        if (Number.isFinite(y))
          scroller.scrollTo(Math.max(0, scroller.y() + y - insets.top - TOP_MARGIN), !reducedMotion);
        accept();
      });
    } else {
      accept();
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
      putPost(p.id, { ...p, firedByMe: on, firesCount: p.firesCount + (on ? 1 : -1) });
      try {
        const state = await api.fireCrewPost(crew.id, p.id, on);
        putPost(p.id, (cur) => ({ ...cur, ...state }));
      } catch (e) {
        putPost(p.id, p);
        throw e;
      }
    });
  const vote = (p: CrewPostView, optionId: string) =>
    act(p.id, async () => putPost(p.id, await api.voteCrewPoll(crew.id, p.id, optionId)));
  const closePoll = (p: CrewPostView) =>
    act(p.id, async () => {
      putPost(p.id, await api.closeCrewPoll(crew.id, p.id));
      setMenu(null);
      setOk(crewFeedLabels.pollClosedToast);
    });
  const going = (o: CrewFeedOuting) =>
    act(o.id, async () => {
      const v = await api.answerCrewOuting(crew.id, o.id, "yes");
      putOuting(o.id, (cur) => ({ ...cur, yes: v.yes, maybe: v.maybe, mine: v.mine }));
      setOk(crewPageLabels.feedOutingYesToast(o.title));
    });
  const remove = async (p: CrewPostView) => {
    if (!(await confirmRemove(crewFeedLabels.removePostConfirm))) return;
    await act(p.id, async () => {
      await api.removeCrewPost(crew.id, p.id);
      putPost(p.id, null);
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
      {stale ? (
        <Muted variant="caption" accessibilityRole="text" testID="crew-feed-stale">
          {crewFeedLabels.liveStale}
        </Muted>
      ) : null}
      <View ref={listRef} collapsable={false} style={styles.list}>
        {feed.error && !items?.length ? (
          <LoadError message={feed.error || crewFeedLabels.loadError} onRetry={() => void reload()} />
        ) : items === null ? (
          <Muted variant="body">…</Muted>
        ) : items.length === 0 ? (
          <Muted variant="body" testID="crew-feed-empty">
            {crewFeedLabels.empty}
          </Muted>
        ) : (
          items.map((item) => {
            if (item.type === "crew_outing") {
              const o = item.outing;
              return (
                <AutoCard
                  key={item.key}
                  item={item}
                  busy={busy === o.id}
                  onGoing={crew.archived ? undefined : () => void going(o)}
                />
              );
            }
            if (item.type !== "post") return <AutoCard key={item.key} item={item} />;
            const p = item.post;
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
      {feed.hasMore ? (
        <SmButton
          kind="s"
          wide
          icon="down"
          disabled={feed.loadingMore}
          onPress={() => void feed.loadMore()}
          testID="crew-feed-more"
        >
          {crewFeedLabels.loadMore}
        </SmButton>
      ) : null}
      {feed.error && items?.length ? <LoadError message={feed.error} onRetry={() => void feed.loadMore()} /> : null}
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
        onCount={(id, delta) =>
          putPost(id, (cur) => ({ ...cur, commentsCount: Math.max(0, cur.commentsCount + delta) }))
        }
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
  // La pastille des nouveautés, posée en haut de l'écran (zone des feuilles), centrée. Tour 2 : le petit bouton se
  // cale à gauche (`alignSelf: flex-start` du kit) ; la pastille se recentre elle-même.
  pillZone: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 30 },
  pill: { borderRadius: tokens.radius.radiusPill, alignSelf: "center" },
});
