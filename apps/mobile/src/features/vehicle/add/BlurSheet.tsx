// Floutage de plaque depuis la page du véhicule (lot 51) :
//  - photo déjà en ligne : la personne place le cadre puis confirme, l'API floute définitivement (V9) ;
//  - photo ajoutée après la création (relecture) : elle passe par le même éditeur **avant l'envoi** — cadres proposés
//    par l'appareil quand il le peut (ML Kit), sinon posés à la main —, ou par la confirmation explicite « Envoyer sans
//    flouter : aucune plaque visible ». Aucun original portant une plaque n'est envoyé sans cadre.
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
import { type PickedPhoto, photoForm } from "@/lib/photos";
import { detectPlates } from "@/lib/plates/detect";
import { AppSheet } from "@/ui/AppSheet";
import { PhotoBadge, PlateFrameEditor } from "./PlateFrameEditor";
import { ChoiceRow } from "./parts";

export type BlurTarget = { kind: "remote"; photo: VehiclePhoto } | { kind: "local"; photo: PickedPhoto } | null;

export function BlurSheet({
  vehicleId,
  target,
  onClose,
  onDone,
}: {
  vehicleId: string;
  /** La photo à flouter (en ligne) ou à envoyer (locale) ; `null` : feuille fermée. */
  target: BlurTarget;
  onClose: () => void;
  onDone: (vehicle: VehicleFull) => Promise<unknown>;
}) {
  const { t } = useTheme();
  const [rects, setRects] = useState<PlateRect[]>([]);
  const [noPlate, setNoPlate] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const local = target?.kind === "local";

  useEffect(() => {
    if (!target) return;
    setError(null);
    setNoPlate(false);
    if (target.kind === "remote") {
      setRects([DEFAULT_PLATE_FRAME]);
      return;
    }
    // Photo locale : on cherche la plaque sur l'appareil ; rien ne part au serveur avant la confirmation.
    setRects([]);
    setDetecting(true);
    let stale = false;
    detectPlates(target.photo.uri, target.photo.width, target.photo.height)
      .catch(() => null)
      .then((found) => {
        if (!stale && found?.length) setRects(found);
      })
      .finally(() => {
        if (!stale) setDetecting(false);
      });
    return () => {
      stale = true;
    };
  }, [target]);

  async function confirm() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      let v: VehicleFull;
      if (target.kind === "remote") {
        v = await api.blurVehiclePhoto(vehicleId, target.photo.id, rects);
      } else {
        const form = await photoForm(target.photo, 0);
        // Lot M1, tour 2 : des cadres, ou « aucune plaque visible » confirmé ; l'API refuse une photo sans l'un ni l'autre.
        if (rects.length) form.append("plateRects", JSON.stringify(rects));
        else if (noPlate) form.append("noPlate", "true");
        else throw new Error(L.noPlateIssue(1));
        v = await api.uploadVehiclePhoto(vehicleId, form);
      }
      await onDone(v);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const source = target
    ? target.kind === "remote"
      ? mediaSource(target.photo.url)
      : { uri: target.photo.uri }
    : undefined;
  const ready = rects.length > 0 || (local && noPlate);
  return (
    <AppSheet visible={target !== null} onClose={onClose} accessibilityLabel={L.blurAction} maxHeight={0.92}>
      <Text variant="title" color={t.color.ink}>
        {L.blurAction}
      </Text>
      <Text variant="body" color={t.color.inkMuted}>
        {L.blurHelp}
      </Text>
      {target ? (
        <PlateFrameEditor
          source={source}
          width={target.photo.width}
          height={target.photo.height}
          rects={rects}
          editable
          mask="black"
          loupe
          onChange={setRects}
          badge={
            <PhotoBadge accent={rects.length > 0}>
              {detecting ? L.detecting : rects.length ? L.blurredCount(rects.length) : L.placeFrame}
            </PhotoBadge>
          }
          testID="blur-editor"
        />
      ) : null}
      <Button
        variant="secondary"
        icon="add"
        disabled={rects.length >= MAX_PLATE_RECTS || busy}
        onPress={() => {
          setRects((r) => [...r, nextPlateFrame(r)]);
          setNoPlate(false);
        }}
        fullWidth
        testID="blur-frame-add"
      >
        {L.addFrame}
      </Button>
      {local && rects.length === 0 ? (
        <ChoiceRow
          title={L.noPlate}
          icon="check"
          selected={noPlate}
          onPress={() => setNoPlate((x) => !x)}
          testID="blur-none"
        />
      ) : null}
      {error ? (
        <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button
        variant="primary"
        icon="plate"
        loading={busy}
        disabled={!ready || detecting}
        onPress={() => void confirm()}
        fullWidth
        testID="blur-confirm"
      >
        {local ? L.sendPhoto : L.blurConfirm}
      </Button>
      <Button variant="plate" icon="back" onPress={onClose} fullWidth>
        Fermer
      </Button>
    </AppSheet>
  );
}
