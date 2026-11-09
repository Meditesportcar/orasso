// La plaque de la story (lot R7f3, maquette R7.8 étape 2) : la plaque est cherchée par ML Kit sur la **photo d'origine**
// (`detect.ts`), les cadres proposés se règlent au doigt (`PlateFrameEditor` du Garage, cadre noir plein), puis la décision
// est obligatoire : « Flouter la plaque » (un cadre posé et placé) ou « Aucune plaque n'est visible » (confirmée). Sans
// décision, « Valider » est grisé avec la ligne qui dit pourquoi (dans l'écran parent). Les cadres restent dans les
// coordonnées de la photo d'origine : le serveur les transforme avec le cadrage. Un cadre hors du cadre visible après
// « Ajuster » part quand même (sans danger). Même règle quel que soit le public, crew compris.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { storyPublishLabels as L, vehicleWizardLabels as V } from "@orasso/shared";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { PlateFrameEditor } from "@/features/vehicle/add/PlateFrameEditor";
import { SmButton } from "@/ui/Kit";
import { Muted } from "@/ui/Muted";
import {
  addFrame,
  blurInstead,
  confirmNoPlateFor,
  framesFromDetection,
  plateControls,
  removeFrame,
  setFrames,
} from "../../fil/publish/model";
import type { StoryDraft } from "./model";
import { Option } from "./parts";

const { space2, space3 } = tokens.spacing;

export function Plate({
  draft,
  onPlate,
  locked,
}: {
  draft: StoryDraft;
  onPlate: (next: StoryDraft["plate"]) => void;
  /** L'envoi est en cours : ni cadre ni décision ne bougent (l'écran montre ce qui part). */
  locked: boolean;
}) {
  const { t } = useTheme();
  const c = t.color;
  const p = draft.plate;
  const photo = p.photo;
  const controls = plateControls(p);
  // La confirmation porte la clé de la photo (jamais un index) : elle se ferme si la photo change.
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: la confirmation se ferme quand la photo change.
  useEffect(() => setConfirmKey(null), [p.key, photo.uri]);
  const confirming = confirmKey === p.key;

  const blurSelected = !p.noPlate && p.rects.length > 0;
  const state =
    p.detection === "pending"
      ? L.plateSearching
      : p.noPlate
        ? V.noPlateConfirmBody
        : p.rects.length
          ? (framesFromDetection(p) ? L.plateFound : L.platePlaced)(p.rects.length)
          : L.plateNotFound;

  return (
    <View style={styles.block} testID="story-plate">
      <PlateFrameEditor
        key={p.key + photo.uri}
        source={{ uri: photo.uri }}
        width={photo.width}
        height={photo.height}
        rects={p.rects}
        editable={p.rects.length > 0 && !locked}
        onChange={(rects) => onPlate(setFrames(p, rects))}
        mask="black"
        loupe
        testID="story-plate-editor"
      />
      <Text variant="caption" color={c.inkMuted} accessibilityLiveRegion="polite" testID="story-plate-state">
        {state}
      </Text>
      <View style={styles.row}>
        <SmButton
          kind="s"
          icon="add"
          disabled={locked || !controls.canAdd}
          onPress={() => onPlate(addFrame(p))}
          testID="story-plate-add"
        >
          {V.addFrame}
        </SmButton>
        {p.rects.length ? (
          <SmButton
            kind="s"
            icon="close"
            disabled={locked}
            onPress={() => onPlate(removeFrame(p))}
            testID="story-plate-remove"
          >
            {V.removeFrame}
          </SmButton>
        ) : null}
      </View>

      <Text variant="posterM" color={c.ink}>
        {L.plateTitle}
      </Text>
      <Muted variant="body">{L.plateIntro}</Muted>

      <Option
        icon="plate"
        title={L.plateBlur}
        hint={p.detected.length ? L.plateBlurHintFound : L.plateBlurHint}
        selected={blurSelected}
        disabled={locked || controls.searching}
        onPress={() => onPlate(p.noPlate ? blurInstead(p) : p.rects.length ? p : addFrame(p))}
        testID="story-plate-blur"
      />
      {confirming ? (
        <View style={[styles.confirm, { backgroundColor: c.surface }]} testID="story-plate-none-confirm">
          <Text variant="bodyStrong" color={c.ink}>
            {V.noPlateConfirmTitle}
          </Text>
          <Text variant="caption" color={c.inkMuted}>
            {V.noPlateConfirmBody}
          </Text>
          <SmButton
            kind="s"
            icon="check"
            wide
            disabled={locked || !controls.canNone}
            onPress={() => {
              // La confirmation vise la photo dont elle porte la clé : si elle n'est plus là, rien ne bouge.
              const [next] = confirmNoPlateFor([p], confirmKey);
              if (next) onPlate(next);
              setConfirmKey(null);
            }}
            testID="story-plate-none-yes"
          >
            {V.noPlateConfirm}
          </SmButton>
          <SmButton kind="g" icon="close" wide onPress={() => setConfirmKey(null)}>
            Annuler
          </SmButton>
        </View>
      ) : (
        <Option
          icon="eye"
          title={L.plateNone}
          hint={L.plateNoneHint}
          selected={p.noPlate}
          disabled={locked || !controls.canNone}
          onPress={() => (p.noPlate ? undefined : setConfirmKey(p.key))}
          testID="story-plate-none"
        />
      )}
      <Muted variant="caption">{V.irreversible}</Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  confirm: { gap: space2, padding: space3, borderRadius: tokens.radius.radiusMd },
});
