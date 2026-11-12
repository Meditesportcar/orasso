// Le menu « ⋯ » d'une publication posée dans une liste de profil ou ouverte seule : « Supprimer » (confirmé) pour qui peut la
// retirer, « Signaler » pour une publication d'un autre. Les droits viennent de l'API (`manage.canDelete` sur la page seule ;
// dans une liste, ma propre publication) ; chaque écriture revérifie les siens côté serveur.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  eventJournalLabels as EL,
  feedScreenLabels as F,
  type FeedPostView,
  publicationsLabels as L,
} from "@orasso/shared";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

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
import { notifyPostRemoved } from "./publicationsSignal";

export function PostMenu({
  post,
  canDelete,
  canCommentsOff = false,
  pin,
  onClose,
  onRemoved,
}: {
  /** La publication dont le menu est ouvert ; `null` : fermé. */
  post: FeedPostView | null;
  canDelete: boolean;
  /** `manage.canCommentsOff` : « Couper les commentaires » / « Rétablir les commentaires ». */
  canCommentsOff?: boolean;
  /** Lot R8d (journal d'un événement) : « Épingler en tête » / « Retirer l'épingle » pour un responsable de la fiche. */
  pin?: { pinned: boolean; onToggle: () => Promise<void> };
  onClose: () => void;
  /** Supprimée : l'écran la retire (la liste) ou revient (la page seule). */
  onRemoved: (post: FeedPostView) => void;
}) {
  const { t } = useTheme();
  const [error, setError] = useState<string | null>(null);

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

  async function togglePin() {
    setError(null);
    try {
      await pin?.onToggle();
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
            <View style={[styles.list, { backgroundColor: t.color.surface, boxShadow: t.shadow.shadowCard }]}>
              {pin ? (
                <SetRow
                  first
                  icon="star"
                  title={pin.pinned ? EL.unpin : EL.pin}
                  onPress={() => void togglePin()}
                  testID="publication-menu-pin"
                />
              ) : null}
              {canDelete ? (
                <SetRow
                  first={!pin}
                  icon="trash"
                  title={L.menuRemove}
                  onPress={() => void remove(post)}
                  tone="out"
                  testID="publication-menu-remove"
                />
              ) : null}
              {canCommentsOff ? (
                <SetRow
                  first={!canDelete && !pin}
                  icon={postLive.apply(post).commentsOff ? "undo" : "close"}
                  title={postLive.apply(post).commentsOff ? L.menuCommentsOn : L.menuCommentsOff}
                  onPress={() => void toggleComments(post)}
                  testID="publication-menu-comments"
                />
              ) : null}
              {post.mine ? null : (
                <SetRow
                  first={!canDelete && !canCommentsOff && !pin}
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
