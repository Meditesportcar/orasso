// Une photo de « Nouvel album » (lot R9e) : le cadre de plaque, ou le retrait. Photo pas encore partie : l'appareil propose les cadres (ML Kit), le
// média les règle ou en pose un à la main (comme dans les galeries d'avant : un détecteur qui rate une plaque ne doit pas la laisser lisible) ; la
// décision (« Flouter et ajouter » | « Envoyer telle quelle ») se prend dans l'étape, jamais ici. Photo dont l'ajout est parti ou réussi : sa
// décision est figée (le serveur la garde), on voit la version du serveur et on peut la retirer. Hébergée par l'écran (`overlays`).
import { Button, Text, useTheme } from "@orasso/design-system/native";
import {
  type AlbumPhotoView,
  albumLabels as L,
  MAX_PLATE_RECTS,
  nextPlateFrame,
  type PlateRect,
  vehicleWizardLabels as W,
} from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { PhotoBadge, PlateFrameEditor } from "@/features/vehicle/add/PlateFrameEditor";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { AlbumPhoto } from "./AlbumPhoto";
import { type AlbumItem, isPhotoLocked } from "./albumUploads";

export type PhotoTarget = { kind: "item"; item: AlbumItem } | { kind: "base"; photo: AlbumPhotoView } | null;

/** Le badge de l'éditeur : le nombre de cadres posés (neutre), ou la décision de **cette** photo ; jamais « floutée » pour une photo qui part lisible. */
export function badgeOf(item: Pick<AlbumItem, "rects" | "decision">): { text: string; accent: boolean } {
  if (item.rects.length === 0) return { text: W.placeFrame, accent: false };
  if (item.decision === "blurred") return { text: W.blurredCount(item.rects.length), accent: true };
  if (item.decision === "kept") return { text: L.keptBadge, accent: false };
  return { text: L.framesPlaced(item.rects.length), accent: false };
}

export function AlbumPhotoSheet({
  target,
  onChange,
  onRemove,
  onClose,
  removing,
  removeError,
  online,
  busy,
  error,
}: {
  target: PhotoTarget;
  onChange: (clientId: string, rects: PlateRect[]) => void;
  /** Retire la photo (rend vrai si elle est retirée : la feuille se ferme). */
  onRemove: () => Promise<boolean>;
  onClose: () => void;
  /** La clé de la photo dont le retrait est en cours (« Retrait… »), et le dernier échec de retrait (la photo reste visible, « Réessayer »). */
  removing: string | null;
  removeError: { key: string; message: string } | null;
  /** Retirer une photo ajoutée demande du réseau : hors ligne, le bouton est désactivé avec son message (pas pour une photo jamais envoyée). */
  online: boolean;
  /** Une opération est en cours (envoi, retrait) : rien d'autre ne part. */
  busy: boolean;
  error?: string | null;
}) {
  const { t } = useTheme();
  const item = target?.kind === "item" ? target.item : null;
  const locked = item ? isPhotoLocked(item) : false;
  const editable = item !== null && !locked;
  const key = target
    ? target.kind === "item"
      ? target.item.clientId
      : (target.photo.clientId ?? target.photo.id)
    : "";
  const failed = removeError?.key === key ? removeError : null;
  const isRemoving = removing === key;
  // Une photo jamais envoyée se retire sans réseau (rien côté serveur) ; une photo ajoutée, en vol ou reprise demande du réseau.
  const needsNetwork = target?.kind === "base" || Boolean(item?.attempted || item?.photoId);
  const offline = needsNetwork && !online;
  return (
    <AppSheet visible={target !== null} onClose={onClose} accessibilityLabel={L.plateSheetTitle} maxHeight={0.92}>
      {target ? (
        <View style={styles.block}>
          <Text variant="bodyStrong" color={t.color.ink}>
            {editable ? L.plateSheetTitle : L.addedPhoto}
          </Text>
          {editable && item ? (
            <>
              <Muted variant="caption">{L.plateSheetHint}</Muted>
              <PlateFrameEditor
                source={{ uri: item.uri }}
                width={item.width}
                height={item.height}
                rects={item.rects}
                editable
                onChange={(rects) => onChange(item.clientId, rects)}
                badge={<PhotoBadge accent={badgeOf(item).accent}>{badgeOf(item).text}</PhotoBadge>}
                testID="album-frame-editor"
              />
              <Button
                variant="secondary"
                icon="add"
                fullWidth
                disabled={item.rects.length >= MAX_PLATE_RECTS}
                onPress={() => onChange(item.clientId, [...item.rects, nextPlateFrame(item.rects)])}
                testID="album-frame-add"
              >
                {W.addFrame}
              </Button>
              <Button variant="secondary" icon="check" fullWidth onPress={onClose} testID="album-frame-done">
                {L.plateSheetDone}
              </Button>
            </>
          ) : (
            <>
              {target.kind === "base" ? (
                <AlbumPhoto photo={target.photo} style={styles.preview} />
              ) : item?.serverUrl ? (
                <AlbumPhoto photo={{ url: item.serverUrl }} style={styles.preview} />
              ) : null}
              {item ? <Notice testID="album-decision-frozen">{L.decisionFrozen}</Notice> : null}
            </>
          )}
          {failed ? (
            <Notice tone="error" testID="album-remove-error">
              {`${L.removeFailed} ${failed.message}`}
            </Notice>
          ) : null}
          {offline ? <Notice testID="album-remove-offline">{L.needNetwork}</Notice> : null}
          {error ? (
            <Notice tone="error" testID="album-sheet-error">
              {error}
            </Notice>
          ) : null}
          <Button
            variant="plate"
            icon="trash"
            fullWidth
            disabled={offline || busy}
            onPress={() => void onRemove().then((done) => done && onClose())}
            testID="album-photo-remove"
          >
            {isRemoving ? L.removing : failed ? L.retry : L.photoRemove}
          </Button>
        </View>
      ) : null}
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  block: { gap: 12 },
  preview: { width: "100%", height: 260 },
});
