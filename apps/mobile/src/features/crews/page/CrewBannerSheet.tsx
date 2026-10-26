// Bannière du crew (lot R5c2, maquette R5.7) : elle se voit hors du crew (vitrine), donc elle passe par la même chaîne
// que les photos de véhicule (invariant « Plaques et photos ») : la plaque cherchée sur l'appareil, des cadres à régler
// et floutés par l'API avant le stockage, ou « Aucune plaque visible sur cette photo » confirmé. Rien ne part sans l'un
// ou l'autre (l'API garderait sinon la bannière pour les seuls membres).
import { Button, Text, useTheme } from "@orasso/design-system/native";
import {
  type CrewView,
  crewPageLabels as L,
  MAX_PLATE_RECTS,
  nextPlateFrame,
  type PlateRect,
  vehicleWizardLabels as W,
} from "@orasso/shared";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { PhotoBadge, PlateFrameEditor } from "@/features/vehicle/add/PlateFrameEditor";
import { ChoiceRow } from "@/features/vehicle/add/parts";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import type { PickedPhoto } from "@/lib/photos";
import { detectPlates } from "@/lib/plates/detect";
import { AppSheet } from "@/ui/AppSheet";

/** Le formulaire de la bannière : le fichier, et les cadres ou la confirmation « aucune plaque ». */
async function bannerForm(photo: PickedPhoto, rects: PlateRect[], noPlate: boolean): Promise<FormData> {
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(photo.uri)).blob();
    form.append("banner", new File([blob], "banniere.jpg", { type: "image/jpeg" }));
  } else {
    form.append("banner", { uri: photo.uri, name: "banniere.jpg", type: "image/jpeg" } as unknown as Blob);
  }
  if (rects.length) form.append("plateRects", JSON.stringify(rects));
  else if (noPlate) form.append("noPlate", "true");
  return form;
}

export function CrewBannerSheet({
  crewId,
  photo,
  onClose,
  onDone,
}: {
  crewId: string;
  /** La photo choisie ; `null` : feuille fermée. */
  photo: PickedPhoto | null;
  onClose: () => void;
  onDone: (view: CrewView) => void;
}) {
  const { t } = useTheme();
  const [rects, setRects] = useState<PlateRect[]>([]);
  const [noPlate, setNoPlate] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!photo) return;
    setError(null);
    setNoPlate(false);
    setRects([]);
    setDetecting(true);
    let stale = false;
    detectPlates(photo.uri, photo.width, photo.height)
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
  }, [photo]);

  async function send() {
    if (!photo) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await api.setCrewBanner(crewId, await bannerForm(photo, rects, noPlate)));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const ready = rects.length > 0 || noPlate;
  return (
    <AppSheet visible={photo !== null} onClose={onClose} accessibilityLabel={L.banner} maxHeight={0.92}>
      <Text variant="title" color={t.color.ink}>
        {L.banner}
      </Text>
      <Text variant="body" color={t.color.inkMuted}>
        {L.bannerHint}
      </Text>
      {photo ? (
        <PlateFrameEditor
          source={{ uri: photo.uri }}
          width={photo.width}
          height={photo.height}
          rects={rects}
          editable
          mask="black"
          loupe
          onChange={setRects}
          badge={
            <PhotoBadge accent={rects.length > 0}>
              {detecting ? W.detecting : rects.length ? W.blurredCount(rects.length) : W.placeFrame}
            </PhotoBadge>
          }
          testID="banner-editor"
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
        testID="banner-frame-add"
      >
        {W.addFrame}
      </Button>
      {rects.length === 0 ? (
        <ChoiceRow
          title={L.bannerNoPlate}
          icon="check"
          selected={noPlate}
          onPress={() => setNoPlate((x) => !x)}
          testID="banner-none"
        />
      ) : null}
      {!ready && !detecting ? (
        <Text variant="caption" color={t.color.inkMuted} testID="banner-missing">
          {W.noPlateIssue(1)}
        </Text>
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
        onPress={() => void send()}
        fullWidth
        testID="banner-send"
      >
        {L.bannerSend}
      </Button>
      <Button variant="plate" icon="back" onPress={onClose} fullWidth>
        {L.sheetClose}
      </Button>
    </AppSheet>
  );
}
