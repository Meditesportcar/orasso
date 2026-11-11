// Le menu « ⋯ » d'une publication posée dans une liste de profil ou ouverte seule : « Supprimer » (confirmé) pour qui peut la
// retirer, « Signaler » pour une publication d'un autre. Les droits viennent de l'API (`manage.canDelete` sur la page seule ;
// dans une liste, ma propre publication) ; chaque écriture revérifie les siens côté serveur.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { feedScreenLabels as F, type FeedPostView, publicationsLabels as L } from "@orasso/shared";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { confirmRemove } from "@/features/crews/feed/confirm";
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
  onClose,
  onRemoved,
}: {
  /** La publication dont le menu est ouvert ; `null` : fermé. */
  post: FeedPostView | null;
  canDelete: boolean;
  onClose: () => void;
  /** Supprimée : l'écran la retire (la liste) ou revient (la page seule). */
  onRemoved: (post: FeedPostView) => void;
}) {
  const { t } = useTheme();
  const [error, setError] = useState<string | null>(null);

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
              {post.mine ? null : (
                <SetRow
                  first={!canDelete}
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
