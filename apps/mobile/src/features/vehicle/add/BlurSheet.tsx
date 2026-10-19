// « Flouter la plaque » d'une photo déjà en ligne (lot 51, page du véhicule) : la personne place le cadre (ou le cadre
// proposé par l'appareil quand la photo est locale, jamais ici : la photo en ligne n'est pas relue), puis confirme ;
// l'API floute définitivement (V9) et la page se recharge avec la pastille « Plaque floutée ».
import { Button, Text, useTheme } from "@orasso/design-system/native";
import {
  DEFAULT_PLATE_FRAME,
  vehicleWizardLabels as L,
  MAX_PLATE_RECTS,
  nextPlateFrame,
  type PlateRect,
  type VehicleFull,
  type VehiclePhoto,
} from "@orasso/shared";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { AppSheet } from "@/ui/AppSheet";
import { PhotoBadge, PlateFrameEditor } from "./PlateFrameEditor";

export function BlurSheet({
  vehicleId,
  photo,
  onClose,
  onDone,
}: {
  vehicleId: string;
  /** La photo à flouter ; `null` : feuille fermée. */
  photo: VehiclePhoto | null;
  onClose: () => void;
  onDone: (vehicle: VehicleFull) => Promise<unknown>;
}) {
  const { t } = useTheme();
  const [rects, setRects] = useState<PlateRect[]>([DEFAULT_PLATE_FRAME]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (photo) {
      setRects([DEFAULT_PLATE_FRAME]);
      setError(null);
    }
  }, [photo]);

  async function confirm() {
    if (!photo || !rects.length) return;
    setBusy(true);
    setError(null);
    try {
      const v = await api.blurVehiclePhoto(vehicleId, photo.id, rects);
      await onDone(v);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppSheet visible={photo !== null} onClose={onClose} accessibilityLabel={L.blurAction} maxHeight={0.92}>
      <Text variant="title" color={t.color.ink}>
        {L.blurAction}
      </Text>
      <Text variant="body" color={t.color.inkMuted}>
        {L.blurHelp}
      </Text>
      {photo ? (
        <PlateFrameEditor
          source={mediaSource(photo.url)}
          width={photo.width}
          height={photo.height}
          rects={rects}
          editable
          onChange={setRects}
          badge={
            <PhotoBadge accent={rects.length > 0}>
              {rects.length ? L.blurredCount(rects.length) : L.placeFrame}
            </PhotoBadge>
          }
          testID="blur-editor"
        />
      ) : null}
      <Button
        variant="secondary"
        icon="add"
        disabled={rects.length >= MAX_PLATE_RECTS || busy}
        onPress={() => setRects((r) => [...r, nextPlateFrame(r)])}
        fullWidth
      >
        {L.addFrame}
      </Button>
      {error ? (
        <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button
        variant="primary"
        icon="plate"
        loading={busy}
        disabled={!rects.length}
        onPress={() => void confirm()}
        fullWidth
        testID="blur-confirm"
      >
        {L.blurConfirm}
      </Button>
      <Button variant="plate" icon="back" onPress={onClose} fullWidth>
        Fermer
      </Button>
    </AppSheet>
  );
}
