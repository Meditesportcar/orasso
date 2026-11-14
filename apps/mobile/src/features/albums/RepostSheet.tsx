// La feuille « Reprendre dans le journal » (lot R9g, T44, maquette R9.8 `ossheetH` puis `reprise`) : la photo avec le crédit « Photo : <média> »
// en surimpression, la légende préremplie « Photo : <média> » (modifiable), « Ce que verront les autres » (la photo et son crédit), et le
// bouton principal « Publier ». Un échec garde la feuille ouverte avec le motif de l'API (déjà reprise, ancienne galerie…).
import { Button, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  type AlbumPhotoView,
  type AlbumView,
  eventPhotosLabels as L,
  repostCaptionDefault,
  repostRefusal,
} from "@orasso/shared";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { CreditOverlay } from "@/features/publications/CreditLine";
import { api } from "@/lib/api";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { AlbumPhoto } from "./AlbumPhoto";

const { space2, space3, space6, space12 } = tokens.spacing;

export function RepostSheet({
  target,
  onClose,
  onDone,
}: {
  target: { album: AlbumView; photo: AlbumPhotoView } | null;
  onClose: () => void;
  /** La publication est écrite : le nom de la structure (celui de l'auteur de la publication) et du média. */
  onDone: (structure: string, media: string) => void;
}) {
  const { t } = useTheme();
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoId = target?.photo.id;
  const mediaName = target?.album.media.name ?? "";
  useEffect(() => {
    if (photoId) {
      setCaption(repostCaptionDefault(mediaName));
      setError(null);
    }
  }, [photoId, mediaName]);
  const credit = target
    ? { mediaKey: target.album.media.key, mediaName: target.album.media.name, albumId: target.album.id }
    : null;
  async function publish() {
    if (!target || busy) return;
    setBusy(true);
    setError(null);
    try {
      const post = await api.repostAlbumPhoto(
        target.album.event.id,
        target.album.id,
        target.photo.id,
        caption.trim() || null,
      );
      onDone(post.author.name, target.album.media.name);
    } catch (e) {
      setError((e instanceof ApiRequestError ? repostRefusal(e.code) : null) ?? errorMessage(e) ?? L.repostFailed);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppSheet visible={target !== null} onClose={onClose} accessibilityLabel={L.repostTitle}>
      {target && credit ? (
        <View style={styles.col}>
          <Text variant="title" color={t.color.ink} accessibilityRole="header">
            {L.repostTitle}
          </Text>
          <TextField
            label={L.repostCaption}
            help={L.repostCaptionHint}
            value={caption}
            onChangeText={setCaption}
            maxLength={2000}
            multiline
            testID="repost-caption"
          />
          <Muted variant="caption">{L.repostWhatOthersSee}</Muted>
          <View style={[styles.preview, { backgroundColor: t.color.night }]} testID="repost-preview">
            <AlbumPhoto photo={target.photo} style={styles.photo} cover />
            <CreditOverlay credit={credit} />
          </View>
          <Text variant="caption" color={t.color.inkMuted}>
            {L.repostedFoot}
          </Text>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button
            variant="primary"
            icon="send"
            fullWidth
            disabled={busy}
            onPress={() => void publish()}
            testID="repost-publish"
          >
            {busy ? L.repostPublishing : L.repostPublish}
          </Button>
        </View>
      ) : null}
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  col: { gap: space3 },
  preview: {
    height: space12 * 3 + space6 * 2,
    borderRadius: tokens.radius.radiusMd,
    overflow: "hidden",
    marginBottom: space2,
  },
  photo: { width: "100%", height: "100%" },
});
