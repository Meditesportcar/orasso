// Grille de photos (lot 36, retours de Damien) : véhicule, réalisations d'un pro, profil prestataire.
//  - retirer une photo passe par la croix visible sur la photo, puis une confirmation (plus de retrait au simple toucher) ;
//  - la première photo est la couverture (carte du véhicule) ; « En couverture » sous une autre la fait passer en tête ;
//  - pendant un envoi, `UploadProgress` dit « photo 2 sur 4 » avec le O vivant (lot 39 : la voiture drifte autour du O,
//    l'anneau se remplit, elle se gare dans le O à la fin ; jamais une roue qui tourne).
import { Button, Chip, duration, olive, Photo, SendProgress, tokens } from "@orasso/design-system/native";
import { photoLabels } from "@orasso/shared";
import { useState } from "react";
import { type ImageSourcePropType, Pressable, StyleSheet, View, type ViewStyle } from "react-native";

import { ConfirmSheet } from "@/features/orga/ConfirmSheet";
import { Muted } from "./Muted";

const { space1, space2 } = tokens.spacing;

export type GridPhoto = { key: string; source: ImageSourcePropType | undefined; label?: string };

export function PhotoGrid({
  photos,
  onRemove,
  onCover,
  onOpen,
  disabled = false,
  tileStyle,
  testID,
}: {
  photos: GridPhoto[];
  /** Retrait confirmé d'une photo (index dans `photos`). */
  onRemove?: (index: number) => unknown;
  /** Passe la photo en tête (couverture). Absent : pas de couverture à choisir. */
  onCover?: (index: number) => unknown;
  /** Toucher la photo (plein écran). */
  onOpen?: (index: number) => void;
  disabled?: boolean;
  tileStyle?: ViewStyle;
  testID?: string;
}) {
  const [removing, setRemoving] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const size = tileStyle ? { ...styles.photo, ...tileStyle } : styles.photo;
  return (
    <>
      <View style={styles.grid} testID={testID}>
        {photos.map((p, i) => (
          <View key={p.key} style={[styles.tile, { width: size.width }]}>
            {/* La croix est posée sur la photo elle-même (et non sur la case, plus large que la photo). */}
            <View>
              <Pressable
                accessibilityRole={onOpen ? "button" : "image"}
                accessibilityLabel={p.label ?? `Photo ${i + 1}`}
                disabled={!onOpen}
                onPress={() => onOpen?.(i)}
              >
                <Photo source={p.source} style={size} />
              </Pressable>
              {onRemove ? (
                <View style={styles.remove}>
                  <Button
                    variant="close"
                    label={photoLabels.remove}
                    onPhoto
                    disabled={disabled}
                    onPress={() => setRemoving(i)}
                    testID="photo-remove"
                  />
                </View>
              ) : null}
            </View>
            {onCover ? (
              i === 0 ? (
                <Chip variant="accent">{photoLabels.cover}</Chip>
              ) : (
                <Button
                  variant="plate"
                  icon="up"
                  disabled={disabled}
                  onPress={() => void onCover(i)}
                  fullWidth
                  testID="photo-cover"
                >
                  {photoLabels.makeCover}
                </Button>
              )
            ) : null}
          </View>
        ))}
      </View>
      <ConfirmSheet
        modal
        visible={removing !== null}
        title={photoLabels.removeTitle}
        body={photoLabels.removeBody}
        confirmLabel={photoLabels.removeConfirm}
        confirmIcon="close"
        danger
        busy={busy}
        onConfirm={() => {
          const index = removing;
          if (index === null || !onRemove) return;
          setBusy(true);
          void Promise.resolve(onRemove(index)).finally(() => {
            setBusy(false);
            setRemoving(null);
          });
        }}
        onClose={() => setRemoving(null)}
      />
    </>
  );
}

export type UploadState = { current: number; total: number; done?: boolean };

/**
 * Envoi en cours : « Envoi de la photo 2 sur 4… » et le O vivant (lot 39, décision de Damien v39) : la voiture drifte
 * autour du O pendant tout l'envoi, l'anneau moutarde se remplit photo par photo (les photos envoyées), puis à la fin
 * (`done`) l'anneau se ferme et la voiture se gare dans le O. L'appelant attend `waitUploadParked()` avant de démonter.
 */
export function UploadProgress({ current, total, done }: UploadState) {
  if (total <= 0) return null;
  return (
    <View style={styles.progress}>
      <SendProgress size={56} progress={done ? 1 : Math.max(0, current - 1) / total} />
      <Muted variant="meta" accessibilityLiveRegion="polite" style={styles.progressText}>
        {total === 1 ? photoLabels.uploadingOne : photoLabels.uploading(current, total)}
      </Muted>
    </View>
  );
}

/** Le temps que l'anneau se ferme et que la voiture se gare (à attendre après `done`, avant de quitter l'écran). */
export function waitUploadParked(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, duration.base + olive.park + duration.fast));
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  tile: { gap: space1, alignItems: "flex-start" },
  photo: { width: 160, height: 120, borderRadius: tokens.radius.radiusSm },
  remove: { position: "absolute", top: space1, right: space1 },
  progress: { flexDirection: "row", alignItems: "center", gap: space2 },
  progressText: { flex: 1 },
});
