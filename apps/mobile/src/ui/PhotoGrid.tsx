// Grille de photos (lot 36, retours de Damien) : véhicule, réalisations d'un pro, profil prestataire.
//  - retirer une photo passe par la croix visible sur la photo, puis une confirmation (plus de retrait au simple toucher) ;
//  - la première photo est la couverture (carte du véhicule) ; « En couverture » sous une autre la fait passer en tête ;
//  - pendant un envoi, `UploadProgress` dit « photo 2 sur 4 » avec une barre et l'indicateur du kit (la voiture qui se
//    gare, jamais une roue qui tourne).
import { Button, Chip, Loader, Photo, tokens, useTheme } from "@orasso/design-system/native";
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

/** Envoi en cours : « Envoi de la photo 2 sur 4… », une barre par photo, l'indicateur du kit. */
export function UploadProgress({ current, total }: { current: number; total: number }) {
  const { t } = useTheme();
  if (total <= 0) return null;
  return (
    <View
      style={styles.progress}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: current }}
    >
      <View style={styles.progressHead}>
        <Loader size={24} />
        <Muted variant="meta" accessibilityLiveRegion="polite">
          {total === 1 ? photoLabels.uploadingOne : photoLabels.uploading(current, total)}
        </Muted>
      </View>
      <View style={styles.segments}>
        {Array.from({ length: total }, (_, i) => (
          <View
            key={`u${i.toString()}`}
            style={[styles.segment, { backgroundColor: i < current ? t.color.accent : t.color.line }]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  tile: { gap: space1, alignItems: "flex-start" },
  photo: { width: 160, height: 120, borderRadius: tokens.radius.radiusSm },
  remove: { position: "absolute", top: space1, right: space1 },
  progress: { gap: space1 },
  progressHead: { flexDirection: "row", alignItems: "center", gap: space2 },
  segments: { flexDirection: "row", gap: space1 },
  segment: { flex: 1, height: 4 },
});
