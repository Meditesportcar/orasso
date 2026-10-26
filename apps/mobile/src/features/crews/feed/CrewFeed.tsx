// Onglet Fil du crew (lot R5c1, maquette R5.7 `t-c-page`, données `POSTS`) : le composeur (« Publier », bouton
// principal de l'onglet), puis les publications et les événements automatiques, 20 par page. Réservé aux membres
// actifs : l'API répond 404 à tout autre compte. Composant autonome, monté par la page du crew (onglet Fil, lot R5c2).
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { type CrewFeedItem, type CrewPostView, crewFeedLabels } from "@orasso/shared";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { usePaged } from "@/features/explorer/usePaged";
import { SmButton } from "@/features/passionne/kit";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useSession } from "@/lib/session";
import { Avatar } from "@/ui/Avatar";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";

import { confirmRemove } from "./confirm";
import { takeCrewFeedDirty } from "./feedSignal";
import { AutoCard, PostCard } from "./PostCard";
import { CommentsSheet, PostMenuSheet } from "./Sheets";

export type CrewFeedCrew = { id: string; slug: string; archived?: boolean };

export function CrewFeed({ crew }: { crew: CrewFeedCrew }) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { me } = useSession();
  const paged = usePaged<CrewFeedItem>((cursor) => api.crewFeed(crew.id, cursor), [crew.id]);
  // Publications modifiées sur place (flamme, voix, clôture, commentaires) ou retirées (`null`).
  const [changed, setChanged] = useState<Record<string, CrewPostView | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [comments, setComments] = useState<CrewPostView | null>(null);
  const [menu, setMenu] = useState<CrewPostView | null>(null);

  // Une nouvelle liste remplace les changements faits sur l'ancienne.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `paged.items` relance la remise à zéro.
  useEffect(() => setChanged({}), [paged.items]);
  // Retour de « Publier dans le crew » : le fil se relit.
  useFocusEffect(
    useCallback(() => {
      if (takeCrewFeedDirty(crew.id)) void paged.reload();
    }, [crew.id, paged.reload]),
  );

  const current = (p: CrewPostView) => (p.id in changed ? changed[p.id] : p);
  const put = (p: CrewPostView | null, id: string) => setChanged((m) => ({ ...m, [id]: p }));

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
  const remove = async (p: CrewPostView) => {
    if (!(await confirmRemove(crewFeedLabels.removePostConfirm))) return;
    await act(p.id, async () => {
      await api.removeCrewPost(crew.id, p.id);
      put(null, p.id);
      setMenu(null);
      setOk(crewFeedLabels.removed);
    });
  };

  const items = paged.items;
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
      {paged.error && !items?.length ? (
        <LoadError message={paged.error || crewFeedLabels.loadError} onRetry={() => void paged.reload()} />
      ) : items === null ? (
        <Muted variant="body">…</Muted>
      ) : items.length === 0 ? (
        <Muted variant="body" testID="crew-feed-empty">
          {crewFeedLabels.empty}
        </Muted>
      ) : (
        items.map((item) => {
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
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.space2 + 2,
    padding: tokens.spacing.space2 + 2,
    borderRadius: tokens.radius.radiusLg - 2,
  },
  grow: { flex: 1, minWidth: 0 },
});
