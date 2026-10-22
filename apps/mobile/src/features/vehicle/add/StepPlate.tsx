// Étape Plaque de l'ajout (lot 51, prototype `s-vadd` « Sa plaque, floutée ») : Automatique (plaques repérées sur
// l'appareil, cadres proposés) ou À la main (cadre déplaçable et agrandissable, par photo) ; puis le numéro de plaque,
// privé, facultatif pour un ancien véhicule. Le flou est appliqué par l'API à l'envoi et il est définitif : la personne
// voit chaque cadre avant d'envoyer (garde de l'irréversibilité, H3).
//
// Interface (lot M2, pour le conteneur du parcours refait au lot M1) — composant d'étape autonome :
// - entrée : `draft` (les photos `draft.photos`, chacune avec ses cadres `rects`, sa détection `detection` et ses
//   lectures `readings` posées par `detectionPatch` de `./plateStep` après `detectPlateReadings`, plus `plate`,
//   `former`, `status`, `unregistered`) et `draft.blurMode` ;
// - sortie : `onRects(i, rects)` (cadres de la photo i), `onNoPlate(i, bool)` (« Envoyer sans flouter » de la photo i,
//   confirmé ici photo par photo), `onMode(mode)`, et `patch({ plate | former | status | unregistered })` ;
// - état : `stepIssue(<étape Plaque>, draft)` de `./model` dit ce qui bloque (photo à régler, numéro obligatoire).
// Le numéro est prérempli d'après la lecture des photos (`plateSuggestion`), à confirmer ; un format étranger n'est
// qu'un avertissement (`plateWarning`), l'API stocke une forme unique (lot M2).
import { Button, CheckboxField, Chip, ChipRow, TextField, tokens } from "@orasso/design-system/native";
import { archiveStatusChoices, vehicleWizardLabels as L, MAX_PLATE_RECTS, nextPlateFrame } from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, View } from "react-native";

import { ConfirmSheet } from "@/features/orga/ConfirmSheet";
import { mediaSource } from "@/lib/media";
import { Muted } from "@/ui/Muted";
import { Overlay } from "@/ui/Overlay";
import { type BlurMode, blurredCount, type Draft, type DraftPhoto, detectionUnavailable } from "./model";
import { PhotoBadge, PlateFrameEditor } from "./PlateFrameEditor";
import { ChoiceRow, StepHead, StepNote } from "./parts";
import { plateSuggestion, plateWarning } from "./plateStep";

const { space2 } = tokens.spacing;

function badgeOf(p: DraftPhoto, mode: BlurMode): { text: string; accent: boolean } {
  if (p.rects.length) return { text: L.blurredCount(p.rects.length), accent: true };
  if (p.plateBlurred) return { text: L.alreadyBlurred, accent: false };
  if (mode === "manual") return { text: L.placeFrame, accent: false };
  if (p.detection === "pending") return { text: L.detecting, accent: false };
  if (p.detection === "unavailable" || p.remoteId) return { text: L.noDetection, accent: false };
  return { text: L.noPlateFound, accent: false };
}

export function StepPlate({
  draft,
  patch,
  onMode,
  onRects,
  onNoPlate,
}: {
  draft: Draft;
  patch: (change: Partial<Draft>) => void;
  onMode: (mode: BlurMode) => void;
  onRects: (index: number, rects: DraftPhoto["rects"]) => void;
  onNoPlate: (index: number, value: boolean) => void;
}) {
  const [index, setIndex] = useState(0);
  const i = Math.min(index, Math.max(0, draft.photos.length - 1));
  const photo = draft.photos[i];
  const manual = draft.blurMode === "manual";
  const badge = photo ? badgeOf(photo, draft.blurMode) : null;
  const total = blurredCount(draft);
  const unavailable = detectionUnavailable(draft.photos);
  // « Envoyer sans flouter » : confirmé photo par photo, la photo sous les yeux (lot M2, retour 17).
  const [confirmNoPlate, setConfirmNoPlate] = useState<number | null>(null);
  const confirmPhoto = confirmNoPlate === null ? undefined : draft.photos[confirmNoPlate];
  // Numéro prérempli par la lecture des photos (à confirmer) ; une fois proposé, jamais réécrit s'il est effacé.
  const suggestion = plateSuggestion(draft.photos, draft.unregistered);
  const proposed = useRef<string | null>(null);
  useEffect(() => {
    if (!suggestion || proposed.current === suggestion || draft.plate.trim()) return;
    proposed.current = suggestion;
    patch({ plate: suggestion });
  }, [suggestion, draft.plate, patch]);
  const plateHelp =
    suggestion && draft.plate.trim() === suggestion ? L.plateRead : (plateWarning(draft.plate) ?? undefined);
  return (
    <>
      <StepHead title={L.plateTitle} text={L.plateText} />
      {unavailable ? <StepNote icon="plate">{L.noDetection}</StepNote> : null}
      <View style={styles.modeRow}>
        <ChipRow accessibilityRole="radiogroup" accessibilityLabel={L.plateTitle}>
          {/* Relecture : sans détection possible ici (web, Expo Go), « Automatique » ne promet rien qu'on ne fait pas. */}
          {unavailable ? null : (
            <Chip
              accessibilityRole="radio"
              selected={!manual}
              onPress={() => onMode("auto")}
              accessibilityLabel={L.auto}
            >
              {L.auto}
            </Chip>
          )}
          <Chip
            accessibilityRole="radio"
            selected={manual}
            onPress={() => onMode("manual")}
            accessibilityLabel={L.manual}
          >
            {L.manual}
          </Chip>
        </ChipRow>
        <Muted variant="meta" testID="plate-blur-count">
          {L.blurredCount(total)}
        </Muted>
      </View>
      {photo ? (
        <>
          <PlateFrameEditor
            source={photo.remoteId ? mediaSource(photo.uri) : { uri: photo.uri }}
            width={photo.width}
            height={photo.height}
            rects={photo.rects}
            editable={manual}
            onChange={(rects) => onRects(i, rects)}
            badge={badge ? <PhotoBadge accent={badge.accent}>{badge.text}</PhotoBadge> : null}
            testID="plate-editor"
          />
          <View style={styles.row}>
            <Button
              variant="close"
              icon="back"
              label={L.previousPhoto}
              disabled={i === 0}
              onPress={() => setIndex(i - 1)}
            />
            <Muted variant="meta" style={styles.grow}>
              {L.photoN(i + 1, draft.photos.length)}
            </Muted>
            <Button
              variant="close"
              icon="next"
              label={L.nextPhoto}
              disabled={i >= draft.photos.length - 1}
              onPress={() => setIndex(i + 1)}
              testID="plate-next-photo"
            />
          </View>
          {manual ? (
            <View style={styles.stack}>
              <Button
                variant="secondary"
                icon="add"
                disabled={photo.rects.length >= MAX_PLATE_RECTS}
                onPress={() => onRects(i, [...photo.rects, nextPlateFrame(photo.rects)])}
                fullWidth
                testID="plate-frame-add"
              >
                {L.addFrame}
              </Button>
              {photo.rects.length ? (
                <Button
                  variant="plate"
                  icon="close"
                  onPress={() => onRects(i, photo.rects.slice(0, -1))}
                  fullWidth
                  testID="plate-frame-remove"
                >
                  {L.removeFrame}
                </Button>
              ) : null}
            </View>
          ) : null}
          {!photo.remoteId && photo.rects.length === 0 ? (
            <ChoiceRow
              title={L.noPlate}
              icon="check"
              selected={Boolean(photo.noPlate)}
              onPress={() => (photo.noPlate ? onNoPlate(i, false) : setConfirmNoPlate(i))}
              testID="plate-none"
            />
          ) : null}
          <StepNote icon="alert">{L.irreversible}</StepNote>
        </>
      ) : null}

      <TextField
        label={L.plateNumber}
        value={draft.plate}
        onChangeText={(plate) => patch({ plate })}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!draft.unregistered}
        placeholder="AB-123-CD"
        maxLength={20}
        help={draft.unregistered ? undefined : plateHelp}
        testID="vehicle-plate"
      />
      <ChoiceRow
        title={L.formerTitle}
        detail={L.formerText}
        icon="undo"
        selected={draft.former}
        onPress={() => patch({ former: !draft.former, status: draft.former ? "active" : "keepsake" })}
        testID="vehicle-former"
      />
      {draft.former ? (
        <ChipRow>
          {archiveStatusChoices.map((c) => (
            <Chip key={c.status} selected={draft.status === c.status} onPress={() => patch({ status: c.status })}>
              {c.label}
            </Chip>
          ))}
        </ChipRow>
      ) : null}
      <CheckboxField
        label={L.unregistered}
        checked={draft.unregistered}
        onChange={(unregistered) => patch({ unregistered, plate: unregistered ? "" : draft.plate })}
      />
      <StepNote icon="plate">{L.privacyNote}</StepNote>
      {/* Zone des feuilles de l'écran : sinon le pied du parcours (Retour / Envoyer) passe par-dessus la feuille. */}
      <Overlay>
        <ConfirmSheet
          visible={confirmPhoto !== undefined}
          title={L.noPlateConfirmTitle}
          body={L.noPlateConfirmBody}
          confirmLabel={L.noPlateConfirm}
          confirmIcon="check"
          onConfirm={() => {
            if (confirmNoPlate !== null) onNoPlate(confirmNoPlate, true);
            setConfirmNoPlate(null);
          }}
          onClose={() => setConfirmNoPlate(null)}
        >
          {confirmPhoto ? (
            <Image
              source={confirmPhoto.remoteId ? mediaSource(confirmPhoto.uri) : { uri: confirmPhoto.uri }}
              style={[styles.confirmPhoto, { aspectRatio: confirmPhoto.width / Math.max(1, confirmPhoto.height) }]}
              resizeMode="contain"
              accessibilityLabel={L.photoN((confirmNoPlate ?? 0) + 1, draft.photos.length)}
              testID="plate-none-photo"
            />
          ) : null}
        </ConfirmSheet>
      </Overlay>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space2 },
  modeRow: { flexDirection: "row", alignItems: "center", gap: space2 },
  grow: { flex: 1, textAlign: "center" },
  stack: { gap: space2 },
  confirmPhoto: { width: "100%", maxHeight: 280, borderRadius: tokens.radius.radiusMd },
});
