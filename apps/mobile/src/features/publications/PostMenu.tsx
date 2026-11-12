// Le menu « ⋯ » d'une publication posée dans une liste de profil ou ouverte seule : « Supprimer » (confirmé) pour qui peut la
// retirer, « Signaler » pour une publication d'un autre. Les droits viennent de l'API (`manage.canDelete` sur la page seule ;
// dans une liste, ma propre publication) ; chaque écriture revérifie les siens côté serveur.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { feedScreenLabels as F, type FeedPostView, publicationsLabels as L, coauthorLabels as T } from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, View } from "react-native";

import { confirmRemove } from "@/features/crews/feed/confirm";
import { postLive } from "@/features/fil/comments/live";
import { forgetMyPublished, markFeedDirty } from "@/features/fil/feedSignal";
import { SetRow } from "@/features/profil/parts";
import { openReport } from "@/features/ReportSheet";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { AppSheet } from "@/ui/AppSheet";
import { Notice } from "@/ui/Notice";
import { Overlay } from "@/ui/Overlay";
import { notifyPostChanged, notifyPostRemoved } from "./publicationsSignal";

/** Le temps de lire « Tu n'es plus co-auteur… » avant que la feuille se ferme. */
const DONE_MS = 1800;

/** « Me retirer » demande confirmation (navigateur : `window.confirm` ; téléphone : boîte de dialogue du système). */
function confirmWithdraw(author: string): Promise<boolean> {
  const text = T.withdrawConfirmText(author);
  if (Platform.OS === "web")
    return Promise.resolve(
      window.confirm(`${T.withdrawConfirmTitle}
${text}`),
    );
  return new Promise((resolve) =>
    Alert.alert(T.withdrawConfirmTitle, text, [
      { text: "Annuler", style: "cancel", onPress: () => resolve(false) },
      { text: T.withdrawConfirm, style: "destructive", onPress: () => resolve(true) },
    ]),
  );
}

export function PostMenu({
  post,
  canDelete,
  canCommentsOff = false,
  onClose,
  onRemoved,
}: {
  /** La publication dont le menu est ouvert ; `null` : fermé. */
  post: FeedPostView | null;
  canDelete: boolean;
  /** `manage.canCommentsOff` : « Couper les commentaires » / « Rétablir les commentaires ». */
  canCommentsOff?: boolean;
  onClose: () => void;
  /** Supprimée : l'écran la retire (la liste) ou revient (la page seule). */
  onRemoved: (post: FeedPostView) => void;
}) {
  const { t } = useTheme();
  const [error, setError] = useState<string | null>(null);
  // Collaboration (R8o) : la confirmation reste dans la feuille un instant, puis elle se ferme.
  const [done, setDone] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /** « Me retirer », « Annuler l'invitation » ou « Retirer le co-auteur » : la route dit le reste (l'API revérifie les droits). */
  async function leave(target: FeedPostView, message: string) {
    setError(null);
    if (target.coAuthoredByMe && !(await confirmWithdraw(target.author.name))) return;
    try {
      await api.withdrawCoAuthor(target.id);
      // Les listes et le Fil se relisent tout de suite ; le minuteur ne sert qu'à la confirmation visible.
      markFeedDirty();
      notifyPostChanged(target.id);
      setDone(message);
      timer.current = setTimeout(() => {
        setDone(null);
        onClose();
      }, DONE_MS);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function toggleComments(target: FeedPostView) {
    setError(null);
    const off = !postLive.apply(target).commentsOff;
    try {
      const res = await api.setFeedCommentsOff(target.id, off);
      postLive.set(target, { ...postLive.apply(target), commentsOff: res.commentsOff });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function remove(target: FeedPostView) {
    setError(null);
    if (!(await confirmRemove(F.removeConfirm))) return;
    try {
      await api.removeFeedPost(target.id);
      // La copie gardée en tête du Fil part aussi, et le Fil se relit à son retour : la carte n'y revient pas.
      forgetMyPublished(`feed_post:${target.id}`);
      markFeedDirty();
      notifyPostRemoved(target.id);
      onClose();
      onRemoved(target);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Overlay>
      <AppSheet
        visible={Boolean(post)}
        onClose={() => {
          setError(null);
          onClose();
        }}
        accessibilityLabel={L.menuOpen}
      >
        {post ? (
          <>
            <View style={styles.head}>
              <Text variant="posterM" color={t.color.ink} style={styles.title} accessibilityRole="header">
                {L.pageTitle}
              </Text>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Fermer"
                hitSlop={6}
                style={[styles.closex, { backgroundColor: t.color.surface }]}
                testID="publication-menu-close"
              >
                <Icon name="close" size={20} color={t.color.ink} />
              </Pressable>
            </View>
            {error ? (
              <Notice tone="error" testID="publication-menu-error">
                {error}
              </Notice>
            ) : null}
            {done ? <Notice testID="publication-menu-done">{done}</Notice> : null}
            {post.coAuthorInvite && post.coAuthorInvite.status !== "accepted" ? (
              <Notice testID="publication-menu-invite">
                {T.inviteStatus(post.coAuthorInvite.name, post.coAuthorInvite.status)}
              </Notice>
            ) : null}
            <View style={[styles.list, { backgroundColor: t.color.surface, boxShadow: t.shadow.shadowCard }]}>
              {canDelete ? (
                <SetRow
                  first
                  icon="trash"
                  title={L.menuRemove}
                  onPress={() => void remove(post)}
                  tone="out"
                  testID="publication-menu-remove"
                />
              ) : null}
              {post.coAuthoredByMe && !done ? (
                <SetRow
                  first={!canDelete}
                  icon="close"
                  title={T.withdraw}
                  onPress={() => void leave(post, T.withdrawn(post.author.name))}
                  tone="out"
                  testID="publication-menu-withdraw"
                />
              ) : null}
              {post.coAuthorInvite && !done && post.coAuthorInvite.status === "pending" ? (
                <SetRow
                  first={!canDelete && !post.coAuthoredByMe}
                  icon="close"
                  title={T.cancelInvite}
                  onPress={() => void leave(post, T.cancelled)}
                  testID="publication-menu-cancel-invite"
                />
              ) : null}
              {post.coAuthorInvite && !done && post.coAuthorInvite.status === "accepted" ? (
                <SetRow
                  first={!canDelete && !post.coAuthoredByMe}
                  icon="close"
                  title={T.removeCoAuthor}
                  onPress={() => void leave(post, T.removed)}
                  testID="publication-menu-remove-coauthor"
                />
              ) : null}
              {canCommentsOff ? (
                <SetRow
                  first={!canDelete && !post.coAuthoredByMe && !post.coAuthorInvite}
                  icon={postLive.apply(post).commentsOff ? "undo" : "close"}
                  title={postLive.apply(post).commentsOff ? L.menuCommentsOn : L.menuCommentsOff}
                  onPress={() => void toggleComments(post)}
                  testID="publication-menu-comments"
                />
              ) : null}
              {post.mine ? null : (
                <SetRow
                  first={!canDelete && !canCommentsOff && !post.coAuthoredByMe && !post.coAuthorInvite}
                  icon="flag"
                  title={F.report}
                  caption={F.reportHint}
                  onPress={() => {
                    onClose();
                    openReport({ type: "feed_post", id: post.id });
                  }}
                  tone="out"
                  testID="publication-menu-report"
                />
              )}
            </View>
          </>
        ) : null}
      </AppSheet>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "flex-start", gap: tokens.spacing.space2 },
  title: { flex: 1, fontSize: 20, lineHeight: 22 },
  closex: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  list: { borderRadius: tokens.radius.radiusLg, overflow: "hidden" },
});
