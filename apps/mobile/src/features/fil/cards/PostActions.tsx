// La ligne d'actions d'une publication (lot R8k2, maquette R8.3 `actB`) : flamme (avec son nombre) · commentaire (avec son
// nombre) · partager (icône seule). Elle prend `post` et `onChange(post)` et ne suppose pas le Fil : le profil, la fiche d'un
// événement et les pages la posent telle quelle. La feuille des commentaires est montée ici, à la première ouverture.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { feedCommentScreenLabels as C, type FeedPostView, feedScreenLabels as L, shareLabels } from "@orasso/shared";
import { useIsFocused } from "expo-router";
import { useEffect, useId, useRef, useState } from "react";
import { Pressable, StyleSheet } from "react-native";

import { ShareSheet } from "@/features/share/ShareSheet";
import { api } from "@/lib/api";
import { CommentsSheet } from "../comments/CommentsSheet";
import { postLive, usePostLive } from "../comments/live";

export function PostActions({
  post: server,
  onChange,
  offline = false,
  onShared,
  onOpened,
}: {
  post: FeedPostView;
  onChange?: (post: FeedPostView) => void;
  /** Lot R8c2 : la carte vient de la copie gardée (sans réseau) : flamme et commentaire disent « Pas de réseau », sans rien envoyer. */
  offline?: boolean;
  /** Lot R8c2 : le partage est ouvert depuis cette carte (le Fil le retient comme une interaction). */
  onShared?: () => void;
  /** Lot R8c2 : la feuille des commentaires est ouverte depuis cette carte (le Fil retient `open`). */
  onOpened?: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const { post, change, opening } = usePostLive(server, onChange);
  // Une publication montée deux fois (Fil resté monté sous un profil) n'ouvre qu'une feuille : la première instance la porte.
  const instance = useId();
  // La feuille est portée par l'instance dont l'écran est affiché (le Fil resté monté sous un profil ne la prend pas).
  const focused = useIsFocused();
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  useEffect(() => postLive.register(server.id, instance, focusedRef.current), [server.id, instance]);
  useEffect(() => postLive.setFocused(server.id, instance, focused), [server.id, instance, focused]);
  const isHost = postLive.host(server.id) === instance;
  // Flamme : la réponse de l'API fait foi ; en attendant, le compteur bouge tout de suite (annulé si l'envoi échoue).
  const [fire, setFire] = useState({ count: post.reactionsCount, on: post.reactedByMe });
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  // La feuille n'est montée qu'à sa première ouverture (une carte du Fil n'en porte pas une pour rien).
  const [everOpened, setEverOpened] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(
    () => setFire({ count: post.reactionsCount, on: post.reactedByMe }),
    [post.reactionsCount, post.reactedByMe],
  );
  useEffect(() => {
    if (opening && isHost) setEverOpened(true);
  }, [opening, isHost]);

  const [noNet, setNoNet] = useState(false);
  async function toggle() {
    if (busy) return;
    if (offline) return setNoNet(true);
    const before = fire;
    const on = !before.on;
    setBusy(true);
    setFire({ count: Math.max(0, before.count + (on ? 1 : -1)), on });
    try {
      const res = await api.fireFeedPost(post.id, on);
      if (mounted.current) setFire({ count: res.reactionsCount, on: res.reactedByMe });
    } catch {
      if (mounted.current) setFire(before);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: fire.on, disabled: busy }}
        accessibilityLabel={L.fireLabel(fire.count, fire.on)}
        onPress={toggle}
        style={[styles.pill, { backgroundColor: fire.on ? c.accentSoft : c.ground }]}
        testID="feed-post-fire"
      >
        <Icon name="fire" size={17} color={fire.on ? c.accentText : c.ink} />
        <Text variant="bodyStrong" color={c.ink} style={styles.count} testID="feed-post-fire-count">
          {String(fire.count)}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={C.comment}
        onPress={() => (offline ? setNoNet(true) : (onOpened?.(), postLive.open(post.id, true)))}
        style={[styles.pill, { backgroundColor: c.ground }]}
        testID="feed-post-comment"
      >
        <Icon name="chat" size={17} color={c.ink} />
        <Text variant="bodyStrong" color={c.ink} style={styles.count} testID="feed-post-comment-count">
          {String(post.commentsCount)}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={shareLabels.title}
        onPress={() => {
          onShared?.();
          setSharing(true);
        }}
        style={[styles.pill, { backgroundColor: c.ground }]}
        testID="feed-post-share"
      >
        <Icon name="share" size={17} color={c.ink} />
      </Pressable>
      <ShareSheet visible={sharing} onClose={() => setSharing(false)} target={{ type: "feed_post", id: post.id }} />
      {offline && noNet ? (
        <Text
          variant="caption"
          color={c.inkMuted}
          style={styles.gone}
          accessibilityRole="alert"
          testID="feed-post-no-network"
        >
          {L.noNetwork}
        </Text>
      ) : null}
      {postLive.isGone(post.id) ? (
        <Text variant="caption" color={c.inkMuted} style={styles.gone} testID="feed-post-gone">
          {C.goneNotice}
        </Text>
      ) : null}
      {everOpened && isHost ? (
        <CommentsSheet
          post={post}
          visible={opening !== null}
          focus={opening?.focus ?? false}
          onClose={() => postLive.close()}
          onChange={change}
        />
      ) : null}
    </>
  );
}

const { space3 } = tokens.spacing;
const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: space3,
    borderRadius: tokens.radius.radiusPill,
  },
  count: { fontSize: 13 },
  gone: { fontSize: 12 },
});
