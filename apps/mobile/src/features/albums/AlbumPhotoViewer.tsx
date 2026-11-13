// La visionneuse d'un album (lot R9e, maquette R9.5) : une photo en plein écran, qu'on fait glisser de côté, « Photo N sur M », le crédit
// « Photos : <média> » en surimpression, « Signaler » pour qui n'est pas le média. **L'emplacement `actions` est vide** (R9f : « Identifier
// une voiture » ; R9g : « Reprendre dans le journal ») : il rend `actionsFor(role)` du registre et les enfants qu'on lui passe.
import { Button, Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type AlbumPhotoView, type AlbumView, albumLabels as L } from "@orasso/shared";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SheetBoundary } from "@/ui/Overlay";
import { AlbumPhoto } from "./AlbumPhoto";
import { type AlbumViewerRole, actionsFor } from "./actions/registry";

const { space2, space3, space4 } = tokens.spacing;

export function AlbumPhotoViewer({
  album,
  index,
  role,
  onClose,
  onDismiss,
  onReport,
  onRemove,
  actions,
}: {
  album: AlbumView;
  /** La photo ouverte ; `null` : fermée. */
  index: number | null;
  role: AlbumViewerRole;
  onClose: () => void;
  /** La visionneuse est fermée (iOS : `Modal.onDismiss`) : l'écran ouvre alors la feuille suivante. */
  onDismiss?: () => void;
  /** Signaler la photo **affichée** (l'écran ferme d'abord la visionneuse : un `Modal` natif resterait devant la feuille de signalement). */
  onReport?: (photo: AlbumPhotoView) => void;
  /** Retirer la photo affichée (le média seulement). */
  onRemove?: (photo: AlbumPhotoView) => void;
  /** Emplacement des actions des lots suivants (R9f, R9g). */
  actions?: ReactNode;
}) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const list = useRef<FlatList<AlbumPhotoView>>(null);
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (index !== null) {
      setAt(index);
      // Le Modal monte sa liste après l'ouverture : la photo choisie s'affiche en premier.
      setTimeout(() => list.current?.scrollToIndex({ index, animated: false }), 0);
    }
  }, [index]);
  const photos = album.photos;
  const current = index === null ? null : (photos[Math.min(at, photos.length - 1)] ?? null);
  const registered = actionsFor(role);
  return (
    <Modal
      visible={index !== null}
      animationType="fade"
      onRequestClose={onClose}
      onDismiss={onDismiss}
      transparent={false}
    >
      <SheetBoundary>
        <View
          style={[styles.root, { backgroundColor: t.color.night, paddingTop: insets.top + space2 }]}
          testID="album-viewer"
        >
          <View style={styles.head}>
            <Text variant="bodyStrong" color={t.color.nightInk} style={styles.fill} testID="album-viewer-count">
              {index === null ? "" : L.photoOf(Math.min(at, photos.length - 1) + 1, photos.length)}
            </Text>
            {role !== "media" && current ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={L.report}
                onPress={() => onReport?.(current)}
                hitSlop={8}
                testID="album-viewer-report"
              >
                <Icon name="flag" size={22} color={t.color.nightInk} />
              </Pressable>
            ) : null}
            <Button variant="close" label={L.closeViewer} onPress={onClose} testID="album-viewer-close" />
          </View>
          <FlatList
            ref={list}
            data={photos}
            horizontal
            pagingEnabled
            keyExtractor={(p) => p.id}
            showsHorizontalScrollIndicator={false}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onMomentumScrollEnd={(e) => {
              setAt(Math.round(e.nativeEvent.contentOffset.x / width));
            }}
            style={styles.pages}
            renderItem={({ item, index: i }) => (
              <View style={{ width, height: height * 0.72, justifyContent: "center" }}>
                <AlbumPhoto photo={item} style={styles.photo} label={L.openPhoto(i + 1, photos.length)} />
              </View>
            )}
          />
          <View style={[styles.foot, { paddingBottom: insets.bottom + space3 }]}>
            <Text variant="caption" color={t.color.nightInk} testID="album-viewer-credit">
              {L.creditLine(album.media.name)}
            </Text>
            {/* Emplacement des actions de R9f et R9g. */}
            <View style={styles.actions} testID="album-viewer-actions">
              {current
                ? registered.map((a) => (
                    <Button
                      key={a.id}
                      variant="secondary"
                      icon={a.icon}
                      onPress={() => void a.run({ album, photo: current, role })}
                      testID={`album-action-${a.id}`}
                    >
                      {a.label}
                    </Button>
                  ))
                : null}
              {role === "media" && current && onRemove ? (
                <Button variant="secondary" icon="trash" onPress={() => onRemove(current)} testID="album-viewer-remove">
                  {L.photoRemove}
                </Button>
              ) : null}
              {actions}
            </View>
          </View>
        </View>
      </SheetBoundary>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: space3 },
  head: { flexDirection: "row", alignItems: "center", gap: space3, paddingHorizontal: space3 },
  fill: { flex: 1 },
  pages: { flex: 1 },
  photo: { width: "100%", height: "100%" },
  foot: { gap: space2, paddingHorizontal: space4 },
  actions: { gap: space2 },
});
