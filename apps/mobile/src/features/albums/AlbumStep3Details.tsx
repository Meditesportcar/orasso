// Étape 3 de « Nouvel album » (lot R9e, maquette `albumH` e3) : « Les détails ». Le titre (modifiable), trois lignes (« Crédit · Photos : <média> ·
// automatique », « Rattaché à · <événement> · fixé », « N photos · N plaques floutées · modifier » : retour à l'étape 2), l'option « Les passionnés
// identifiés peuvent enregistrer leurs photos » (décochée par défaut), « Ce que verront les autres » (la carte du Fil) et « Publier l'album ».
import { Button, Icon, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { type AlbumCardView, type AlbumView, albumTitle, albumLabels as L } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

import { AlbumCardBody } from "@/features/fil/cards/AlbumCard";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";

const { space1, space2, space3 } = tokens.spacing;

export function AlbumStep3Details({
  album,
  mediaName,
  title,
  onTitle,
  allowSave,
  onAllowSave,
  blurred,
  busy,
  error,
  onEditPhotos,
  onPublish,
}: {
  album: AlbumView;
  mediaName: string;
  title: string;
  onTitle: (value: string) => void;
  allowSave: boolean;
  onAllowSave: (value: boolean) => void;
  /** Plaques floutées dans l'album (« N plaques floutées »). */
  blurred: number;
  busy: boolean;
  error: string | null;
  onEditPhotos: () => void;
  onPublish: () => void;
}) {
  const { t } = useTheme();
  const shownTitle = albumTitle(title, album.event.title);
  const preview: AlbumCardView = {
    id: album.id,
    title: shownTitle,
    photosCount: album.photosCount,
    author: {
      key: album.media.key,
      kind: "media",
      name: mediaName,
      avatarUrl: album.media.logoUrl,
      verified: album.media.verified,
      pseudo: mediaName,
      grade: null,
      official: false,
    },
    attach: {
      event: {
        id: album.event.id,
        slug: album.event.slug,
        title: album.event.title,
        startsAt: album.event.startsAt,
        endsAt: album.event.endsAt,
        city: null,
      },
      role: "on_site",
      phase: "after",
      presenceValidated: false,
    },
    cover: album.cover,
    official: false,
  };
  return (
    <View style={styles.block}>
      <TextField
        label={L.titleField}
        help={L.titleHelp}
        value={title}
        placeholder={L.defaultTitle(album.event.title)}
        onChangeText={onTitle}
        maxLength={80}
        testID="album-title"
      />
      <View style={[styles.lines, { borderColor: t.color.line, backgroundColor: t.color.surface }]}>
        <View style={styles.line} testID="album-line-credit">
          <Icon name="camera" size={16} color={t.color.inkMuted} />
          <Text variant="body" color={t.color.ink} style={styles.fill}>
            {`${L.credit} · « ${L.creditLine(mediaName)} »`}
          </Text>
          <Muted variant="caption">{L.automatic}</Muted>
        </View>
        <View style={styles.line} testID="album-line-event">
          <Icon name="ticket" size={16} color={t.color.inkMuted} />
          <Text variant="body" color={t.color.ink} style={styles.fill}>
            {`${L.attachedTo} · ${album.event.title}`}
          </Text>
          <Muted variant="caption">{L.fixed}</Muted>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onEditPhotos}
          style={styles.line}
          testID="album-line-photos"
        >
          <Icon name="gallery" size={16} color={t.color.inkMuted} />
          <Text variant="body" color={t.color.ink} style={styles.fill}>
            {L.photosAndPlates(album.photosCount, blurred)}
          </Text>
          <Text variant="caption" color={t.color.accentText}>
            {L.modify}
          </Text>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: allowSave }}
        onPress={() => onAllowSave(!allowSave)}
        style={[
          styles.option,
          { borderColor: allowSave ? t.color.accent : t.color.line, backgroundColor: t.color.surface },
        ]}
        testID="album-allow-save"
      >
        <Icon name="upload" size={20} color={t.color.inkMuted} />
        <View style={styles.fill}>
          <Text variant="bodyStrong" color={t.color.ink}>
            {L.allowSave}
          </Text>
          <Muted variant="caption">{allowSave ? L.allowSaveOn : L.allowSaveOff}</Muted>
        </View>
        {allowSave ? <Icon name="check" size={18} color={t.color.accentText} /> : null}
      </Pressable>

      <View style={styles.says} testID="album-preview">
        <Muted variant="label">{L.whatOthersSee}</Muted>
        <View style={[styles.card, { borderColor: t.color.line, backgroundColor: t.color.surface }]}>
          <View style={styles.cardHead}>
            <Text variant="bodyStrong" color={t.color.ink}>
              {mediaName}
            </Text>
            <Muted variant="caption">{L.mediaTag}</Muted>
          </View>
          <AlbumCardBody album={preview} />
        </View>
      </View>

      {error ? (
        <Notice tone="error" testID="album-publish-error">
          {error}
        </Notice>
      ) : null}
      <Button
        variant="primary"
        icon="send"
        fullWidth
        loading={busy}
        disabled={busy}
        onPress={onPublish}
        testID="album-publish"
      >
        {L.publish}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space3 },
  fill: { flex: 1 },
  lines: { borderWidth: 1, borderRadius: tokens.radius.radiusMd, padding: space3, gap: space3 },
  line: { flexDirection: "row", alignItems: "center", gap: space2 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    borderWidth: 1,
    borderRadius: tokens.radius.radiusMd,
    padding: space3,
  },
  says: { gap: space2 },
  card: { borderWidth: 1, borderRadius: tokens.radius.radiusMd, padding: space3, gap: space2 },
  cardHead: { gap: space1 },
});
