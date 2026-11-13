// Le cadre de plaque d'une photo de « Nouvel album » (lot R9e) : l'appareil propose les cadres (ML Kit), le média les règle ou en pose un à la
// main (comme dans les galeries d'avant : un détecteur qui rate une plaque ne doit pas la laisser lisible), ou retire la photo. Le floutage reste
// proposé, jamais imposé : la décision du lot (« Flouter et ajouter » | « Envoyer telle quelle ») se prend dans l'étape.
import { Button, Text, useTheme } from "@orasso/design-system/native";
import {
  albumLabels as L,
  MAX_PLATE_RECTS,
  nextPlateFrame,
  type PlateRect,
  vehicleWizardLabels as W,
} from "@orasso/shared";
import { View } from "react-native";

import { PhotoBadge, PlateFrameEditor } from "@/features/vehicle/add/PlateFrameEditor";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import type { AlbumItem } from "./albumUploads";

export function AlbumPhotoSheet({
  item,
  onChange,
  onRemove,
  onClose,
}: {
  item: AlbumItem | null;
  onChange: (clientId: string, rects: PlateRect[]) => void;
  onRemove: (clientId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTheme();
  return (
    <AppSheet visible={item !== null} onClose={onClose} accessibilityLabel={L.plateSheetTitle} maxHeight={0.92}>
      {item ? (
        <View style={{ gap: 12 }}>
          <Text variant="bodyStrong" color={t.color.ink}>
            {L.plateSheetTitle}
          </Text>
          <Muted variant="caption">{L.plateSheetHint}</Muted>
          <PlateFrameEditor
            source={{ uri: item.uri }}
            width={item.width}
            height={item.height}
            rects={item.rects}
            editable
            onChange={(rects) => onChange(item.clientId, rects)}
            badge={
              <PhotoBadge accent={item.rects.length > 0}>
                {item.rects.length ? W.blurredCount(item.rects.length) : W.placeFrame}
              </PhotoBadge>
            }
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
          <Button
            variant="plate"
            icon="trash"
            fullWidth
            onPress={() => {
              onRemove(item.clientId);
              onClose();
            }}
            testID="album-photo-remove"
          >
            {L.photoRemove}
          </Button>
        </View>
      ) : null}
    </AppSheet>
  );
}
