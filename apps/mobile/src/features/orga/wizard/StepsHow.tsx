// Assistant d'événement de l'appli (lot 35b ; lot 53 : morceaux repris par les huit temps de `Temps.tsx`) : hauts
// grades et verrouillage, consignes, affiche perso (le sélecteur d'image existant), zones, contrôle des billets.
import {
  Button,
  CheckboxField,
  Photo,
  Plate,
  SelectField,
  Text,
  TextField,
  useTheme,
} from "@orasso/design-system/native";
import {
  gradeLabels,
  grades,
  highGradePreviewOptions,
  highGradesText,
  invitationLabels,
  eventEditorLabels as L,
  lockOffsetOptions,
  shopLabels,
  wizardV2Labels,
} from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { mediaSource } from "@/lib/media";
import { pickOneImage } from "@/lib/structureFiles";
import { Muted } from "@/ui/Muted";
import { Group, wizardStyles } from "./fields";
import type { StepContext } from "./types";

/** Hauts grades (lot 25) et verrouillage : le volet « Hauts grades et verrouillage » du temps « Avant-première ». */
export function HighGradesFields({ d, set }: StepContext) {
  return (
    <>
      <Group label={invitationLabels.highGradeTitle} testID="wizard-high-grades">
        <CheckboxField
          label={invitationLabels.highGradePriority}
          checked={d.highGradePriority}
          onChange={(v) => set("highGradePriority", v)}
        />
        <Muted variant="caption">{invitationLabels.highGradePriorityHint}</Muted>
        <SelectField
          label={invitationLabels.highGradePreview}
          options={highGradePreviewOptions}
          value={d.highGradePreviewHours}
          onValueChange={(v) => set("highGradePreviewHours", v)}
          help={invitationLabels.highGradePreviewHint}
        />
        <SelectField
          label={invitationLabels.highGradeMin}
          options={grades.filter((g) => g !== "rodage").map((g) => ({ value: g, label: gradeLabels[g] }))}
          value={d.highGradeMin}
          onValueChange={(v) => set("highGradeMin", v as typeof d.highGradeMin)}
          help={`Concerne : ${highGradesText(d.highGradeMin)}.`}
        />
      </Group>
      <SelectField
        label={L.lockOffset}
        options={lockOffsetOptions}
        value={d.lockOffsetMinutes}
        onValueChange={(v) => set("lockOffsetMinutes", v)}
        help={L.lockOffsetHint}
      />
    </>
  );
}

/** Consignes aux retenus (temps « Le règlement »). */
export function InstructionsField({ d, set }: StepContext) {
  return (
    <TextField
      label={L.instructions}
      value={d.instructions}
      onChangeText={(v) => set("instructions", v)}
      multiline
      tall
      maxLength={2000}
      help={L.instructionsHint}
      testID="wizard-instructions"
    />
  );
}

/** Affiche perso (lot 47 : « Tu as déjà ton affiche ? »), envoyée avec l'événement, en plus de l'affiche générée. */
export function OwnPosterField({ event, poster, setPoster }: StepContext) {
  const [picking, setPicking] = useState(false);
  const current = poster ? { uri: poster.uri } : mediaSource(event?.customPosterUrl);
  return (
    <Group label={wizardV2Labels.posterOwnTitle} testID="wizard-poster">
      {current ? <Photo source={current} style={styles.poster} accessibilityLabel={L.posterCurrent} /> : null}
      <Muted variant="caption">{poster ? L.posterChosen : wizardV2Labels.posterOwnHint}</Muted>
      <Button
        variant="secondary"
        icon="add"
        loading={picking}
        onPress={async () => {
          setPicking(true);
          try {
            const photo = await pickOneImage();
            if (photo) setPoster(photo);
          } finally {
            setPicking(false);
          }
        }}
        testID="wizard-poster-pick"
      >
        {event?.customPosterUrl || poster ? L.posterReplace : L.posterPick}
      </Button>
      {poster ? (
        <Button variant="plate" icon="close" onPress={() => setPoster(null)}>
          {L.posterRemove}
        </Button>
      ) : null}
    </Group>
  );
}

export function ZonesStep({ d, setD }: StepContext) {
  const { t } = useTheme();
  const update = (i: number, patch: Partial<StepContext["d"]["zones"][number]>) =>
    setD((p) => ({ ...p, zones: p.zones.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  return (
    <>
      <Muted variant="body">{L.zonesIntro}</Muted>
      {d.zones.map((z, i) => (
        <Plate key={z.id ?? `new-${i.toString()}`} style={wizardStyles.block} testID="wizard-zone">
          <Text variant="bodyStrong" color={t.color.plateInk}>
            {L.zone(i + 1)}
          </Text>
          <View style={wizardStyles.row}>
            <TextField
              label={L.zoneCode}
              value={z.code}
              onChangeText={(v) => update(i, { code: v.toUpperCase() })}
              autoCapitalize="characters"
              maxLength={4}
              style={styles.code}
              testID={`wizard-zone-${i}-code`}
            />
            <TextField
              label={L.zoneCapacity}
              value={z.capacity}
              onChangeText={(v) => update(i, { capacity: v.replace(/\D/g, "") })}
              keyboardType="number-pad"
              style={styles.code}
              testID={`wizard-zone-${i}-capacity`}
            />
          </View>
          <TextField
            label={L.zoneName}
            value={z.name}
            onChangeText={(v) => update(i, { name: v })}
            maxLength={60}
            testID={`wizard-zone-${i}-name`}
          />
          <Button
            variant="plate"
            tone="dashed"
            icon="close"
            onPress={() => setD((p) => ({ ...p, zones: p.zones.filter((_, j) => j !== i) }))}
          >
            {L.zoneRemove}
          </Button>
        </Plate>
      ))}
      <Button
        variant="secondary"
        icon="add"
        onPress={() => setD((p) => ({ ...p, zones: [...p.zones, { code: "", name: "", capacity: "" }] }))}
        testID="wizard-zone-add"
      >
        {L.zoneAdd}
      </Button>
    </>
  );
}

/** Contrôle des billets (rôle boutique du staff, lot 24) : le volet « Public » du temps « Les arrivées ». */
export function ShopField({ d, set }: StepContext) {
  return (
    <Group label={L.staffTitle} testID="wizard-shop">
      <CheckboxField
        label={shopLabels.wizardCheckbox}
        checked={d.shopEnabled}
        onChange={(v) => set("shopEnabled", v)}
      />
      <Muted variant="caption">{shopLabels.wizardHint}</Muted>
    </Group>
  );
}
const styles = StyleSheet.create({
  poster: { width: "100%", aspectRatio: 4 / 5 },
  code: { flex: 1, minWidth: 110 },
});
