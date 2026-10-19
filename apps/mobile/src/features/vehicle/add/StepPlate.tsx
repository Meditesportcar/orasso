// Étape 5 de l'ajout (lot 51, prototype `s-vadd` « Sa plaque, floutée ») : Automatique (plaques repérées sur
// l'appareil, cadres proposés) ou À la main (cadre déplaçable et agrandissable, par photo) ; puis le numéro de plaque,
// privé, facultatif pour un ancien véhicule. Le flou est appliqué par l'API à l'envoi et il est définitif : la personne
// voit chaque cadre avant d'envoyer (garde de l'irréversibilité, H3).
import { Button, CheckboxField, Chip, ChipRow, TextField, tokens } from "@orasso/design-system/native";
import { archiveStatusChoices, vehicleWizardLabels as L, MAX_PLATE_RECTS, nextPlateFrame } from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { mediaSource } from "@/lib/media";
import { Muted } from "@/ui/Muted";
import { type BlurMode, blurredCount, type Draft, type DraftPhoto, detectionUnavailable } from "./model";
import { PhotoBadge, PlateFrameEditor } from "./PlateFrameEditor";
import { ChoiceRow, StepHead, StepNote } from "./parts";

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
  return (
    <>
      <StepHead title={L.plateTitle} text={L.plateText} />
      {unavailable ? <StepNote icon="plate">{L.noDetection}</StepNote> : null}
      <ChipRow>
        {/* Relecture : sans détection possible ici (web, Expo Go), « Automatique » ne promet rien qu'on ne fait pas. */}
        {unavailable ? null : (
          <Chip selected={!manual} onPress={() => onMode("auto")} accessibilityLabel={L.auto}>
            {L.auto}
          </Chip>
        )}
        <Chip selected={manual} onPress={() => onMode("manual")} accessibilityLabel={L.manual}>
          {L.manual}
        </Chip>
        <Muted variant="meta" testID="plate-blur-count">
          {L.blurredCount(total)}
        </Muted>
      </ChipRow>
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
              onPress={() => onNoPlate(i, !photo.noPlate)}
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
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space2 },
  grow: { flex: 1, textAlign: "center" },
  stack: { gap: space2 },
});
