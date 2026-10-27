// Feuilles du fil du crew (lot R5c1) : les commentaires d'une publication (300 caractères, Signaler, Retirer pour son
// auteur ou le chef) et le « ⋯ » d'une publication (Signaler, Clore le sondage, Retirer pour l'auteur ou le chef).
// Posées dans la zone des feuilles de l'écran (`Overlay`) : elles couvrent l'écran même depuis un contenu qui défile.
import { Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  CREW_COMMENT_MAX,
  type CrewCommentView,
  type CrewPostView,
  crewFeedLabels,
  mergeCrewComments,
  moderationLabels,
} from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { SmButton } from "@/features/passionne/kit";
import { openReport } from "@/features/ReportSheet";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { cacheScope } from "@/lib/kv";
import { createRequestGate } from "@/lib/requestGate";
import { AppSheet } from "@/ui/AppSheet";
import { Avatar } from "@/ui/Avatar";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { Overlay } from "@/ui/Overlay";

import { confirmRemove } from "./confirm";
import { whenOf } from "./PostCard";
import { useCrewLive } from "./useCrewLive";

const { space2, space3 } = tokens.spacing;

export function CommentsSheet({
  crewId,
  post,
  onClose,
  onCount,
}: {
  crewId: string;
  post: CrewPostView | null;
  onClose: () => void;
  /** Le nombre de commentaires a changé (ajout, retrait). */
  onCount: (postId: string, delta: number) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  // Tour 2 : chaque réponse est rangée sous sa publication (et le compte de départ, `requestGate`) ; ouvrir une autre
  // publication entre-temps ne mélange rien et garde le brouillon de chacune.
  const [byPost, setByPost] = useState<Record<string, { items: CrewCommentView[]; cursor: string | null }>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const gate = useRef(createRequestGate(cacheScope)).current;
  const postId = post?.id ?? null;
  const account = cacheScope();
  const current = postId ? byPost[postId] : undefined;
  const items = current?.items ?? null;
  const cursor = current?.cursor ?? null;
  const text = postId ? (drafts[postId] ?? "") : "";

  // Changement de compte : rien de l'ancien compte ne reste (commentaires, brouillons).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `account` vide les états.
  useEffect(() => {
    gate.invalidate();
    setByPost({});
    setDrafts({});
  }, [account, gate]);

  const load = useCallback(
    async (from?: string) => {
      if (!postId) return;
      const ticket = from ? gate.follow() : gate.start();
      try {
        const page = await api.crewPostComments(crewId, postId, from);
        if (!ticket.current()) return;
        setByPost((all) => ({
          ...all,
          [postId]: {
            items: mergeCrewComments(from ? (all[postId]?.items ?? []) : [], page.items),
            cursor: page.nextCursor,
          },
        }));
        setLoadError(null);
      } catch (e) {
        if (ticket.current()) setLoadError(errorMessage(e));
      }
    },
    [crewId, postId, gate],
  );

  useEffect(() => {
    setError(null);
    setLoadError(null);
    if (postId) void load();
  }, [postId, load]);

  // Lot R6a : feuille ouverte, les commentaires des autres arrivent (et partent) sans la rouvrir.
  const byPostRef = useRef(byPost);
  byPostRef.current = byPost;
  useCrewLive(postId ? crewId : null, async (needs) => {
    const target = postId;
    if (!target) return;
    if (needs.removedComments.length) {
      const gone = new Set(needs.removedComments);
      setByPost((all) =>
        Object.fromEntries(
          Object.entries(all).map(([id, v]) => [id, { ...v, items: v.items.filter((x) => !gone.has(x.id)) }]),
        ),
      );
    }
    if (!needs.comments.includes(target) && !needs.full) return;
    const ticket = gate.follow();
    // Toute la liste était chargée : on la relit jusqu'au bout (au-delà de 50, les nouveaux sont à la fin).
    const hadAll = (byPostRef.current[target]?.cursor ?? null) === null;
    let page = await api.crewPostComments(crewId, target);
    const incoming = [...page.items];
    for (let guard = 0; hadAll && page.nextCursor && guard < 20; guard += 1) {
      page = await api.crewPostComments(crewId, target, page.nextCursor);
      incoming.push(...page.items);
    }
    if (!ticket.current()) return;
    setByPost((all) => ({
      ...all,
      [target]: hadAll
        ? { items: mergeCrewComments([], incoming), cursor: null }
        : { items: mergeCrewComments(all[target]?.items ?? [], incoming), cursor: all[target]?.cursor ?? null },
    }));
  });

  async function send() {
    const target = postId;
    if (!target) return;
    const body = (drafts[target] ?? "").trim();
    if (!body) {
      setError(crewFeedLabels.commentMissing);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await api.commentCrewPost(crewId, target, body);
      // La réponse va à sa publication, même si une autre est ouverte entre-temps.
      setByPost((all) => ({
        ...all,
        [target]: {
          items: mergeCrewComments(all[target]?.items ?? [], [created]),
          cursor: all[target]?.cursor ?? null,
        },
      }));
      setDrafts((all) => ({ ...all, [target]: "" }));
      onCount(target, 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(comment: CrewCommentView) {
    const target = postId;
    if (!target || !(await confirmRemove(crewFeedLabels.removeCommentConfirm))) return;
    setBusy(true);
    setError(null);
    try {
      await api.removeCrewComment(crewId, comment.id);
      setByPost((all) => ({
        ...all,
        [target]: {
          items: (all[target]?.items ?? []).filter((x) => x.id !== comment.id),
          cursor: all[target]?.cursor ?? null,
        },
      }));
      onCount(target, -1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay>
      <AppSheet visible={post !== null} onClose={onClose} accessibilityLabel={crewFeedLabels.comments}>
        <Text variant="posterM" color={c.ink}>
          {crewFeedLabels.comments}
        </Text>
        {loadError ? (
          <LoadError message={loadError} onRetry={() => void load()} />
        ) : items === null ? (
          <Muted variant="body">…</Muted>
        ) : items.length === 0 ? (
          <Muted variant="body">{crewFeedLabels.noComments}</Muted>
        ) : (
          <View style={styles.list} testID="crew-comments">
            {items.map((m) => (
              <View key={m.id} style={styles.comment} testID="crew-comment">
                <Avatar url={m.author?.avatarUrl} pseudo={m.author?.pseudo} size={32} />
                <View style={styles.grow}>
                  <Text variant="caption" color={c.inkMuted}>
                    <Text variant="caption" color={c.ink} style={styles.bold}>
                      {m.author?.pseudo ?? crewFeedLabels.deletedAccount}
                    </Text>
                    {` · ${whenOf(m.createdAt)}`}
                  </Text>
                  <Text variant="body" color={c.ink}>
                    {m.text}
                  </Text>
                  <View style={styles.actions}>
                    {!m.mine ? (
                      <SmButton
                        kind="g"
                        icon="flag"
                        onPress={() => openReport({ type: "crew_comment", id: m.id })}
                        testID="crew-comment-report"
                      >
                        {moderationLabels.report}
                      </SmButton>
                    ) : null}
                    {m.canRemove ? (
                      <SmButton
                        kind="g"
                        icon="trash"
                        disabled={busy}
                        onPress={() => void remove(m)}
                        testID="crew-comment-remove"
                      >
                        {crewFeedLabels.remove}
                      </SmButton>
                    ) : null}
                  </View>
                </View>
              </View>
            ))}
            {cursor ? (
              <SmButton kind="s" icon="down" onPress={() => void load(cursor)}>
                {crewFeedLabels.loadMore}
              </SmButton>
            ) : null}
          </View>
        )}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <TextField
          label={crewFeedLabels.commentPlaceholder}
          value={text}
          onChangeText={(value) => postId && setDrafts((all) => ({ ...all, [postId]: value }))}
          maxLength={CREW_COMMENT_MAX}
          multiline
          testID="crew-comment-input"
        />
        <SmButton kind="p" big wide icon="send" disabled={busy} onPress={() => void send()} testID="crew-comment-send">
          {crewFeedLabels.commentSend}
        </SmButton>
      </AppSheet>
    </Overlay>
  );
}

export function PostMenuSheet({
  post,
  busy,
  onClose,
  onRemove,
  onClosePoll,
}: {
  post: CrewPostView | null;
  busy: boolean;
  onClose: () => void;
  onRemove: (post: CrewPostView) => void;
  onClosePoll: (post: CrewPostView) => void;
}) {
  const { t } = useTheme();
  return (
    <Overlay>
      <AppSheet visible={post !== null} onClose={onClose} accessibilityLabel={crewFeedLabels.more}>
        <Text variant="posterM" color={t.color.ink}>
          {post?.author?.pseudo ?? crewFeedLabels.feed}
        </Text>
        {post && !post.mine ? (
          <SmButton
            kind="s"
            big
            wide
            icon="flag"
            onPress={() => {
              onClose();
              openReport({ type: "crew_post", id: post.id });
            }}
            testID="crew-post-report"
          >
            {moderationLabels.report}
          </SmButton>
        ) : null}
        {post?.poll?.canClose ? (
          <SmButton
            kind="s"
            big
            wide
            icon="lock"
            disabled={busy}
            onPress={() => onClosePoll(post)}
            testID="crew-poll-close"
          >
            {crewFeedLabels.pollClose}
          </SmButton>
        ) : null}
        {post?.canRemove ? (
          <SmButton
            kind="s"
            big
            wide
            icon="trash"
            disabled={busy}
            onPress={() => onRemove(post)}
            testID="crew-post-remove"
          >
            {crewFeedLabels.remove}
          </SmButton>
        ) : null}
        <Muted variant="caption">{crewFeedLabels.visibleHint}</Muted>
      </AppSheet>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  list: { gap: space3 },
  comment: { flexDirection: "row", alignItems: "flex-start", gap: space2 + 2 },
  grow: { flex: 1, minWidth: 0, gap: 2 },
  bold: { fontFamily: "Archivo-ExtraBold" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
});
