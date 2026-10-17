// Assistant d'événement de l'appli (lot 35b) : avant-première et hauts grades, règlement, consignes et affiche (le
// sélecteur d'image existant), zones, puis billetterie, staff boutique et récapitulatif. Mêmes champs que le site.
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
  dayAccessLabels,
  defaultEventRules,
  eventAdmissionLabels,
  eventDaysLabels,
  eventFormatLabels,
  eventPublicAccessLabels,
  gradeLabels,
  grades,
  highGradePreviewOptions,
  highGradesText,
  invitationLabels,
  eventEditorLabels as L,
  lockOffsetOptions,
  previewHourOptions,
  shopLabels,
  sortedDraftDays,
  vehicleTypeLabels,
} from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { mediaSource } from "@/lib/media";
import { pickOneImage } from "@/lib/structureFiles";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { DateTimeFields, Group, RecapRow, wizardStyles } from "./fields";
import type { StepContext } from "./types";

export function PreviewStep({ d, set }: StepContext) {
  return (
    <>
      <DateTimeFields
        dateLabel={L.registrationsDate}
        timeLabel={L.registrationsTime}
        value={d.registrationsOpenAt}
        onChange={(v) => set("registrationsOpenAt", v)}
        testID="wizard-opens"
      />
      <SelectField
        label={L.previewHours}
        options={previewHourOptions}
        value={d.previewHours}
        onValueChange={(v) => set("previewHours", v)}
        help={L.previewHoursHint}
      />
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

export function RulesStep({ d, set }: StepContext) {
  return (
    <>
      <Button variant="secondary" icon="undo" onPress={() => set("rulesText", defaultEventRules)}>
        {L.rulesTemplate}
      </Button>
      <TextField
        label={L.rules}
        value={d.rulesText}
        onChangeText={(v) => set("rulesText", v)}
        multiline
        maxLength={10000}
        help={L.rulesHint}
        style={styles.rules}
        testID="wizard-rules"
      />
    </>
  );
}

export function InfoStep({ d, set, event, poster, setPoster }: StepContext) {
  const [picking, setPicking] = useState(false);
  const current = poster ? { uri: poster.uri } : mediaSource(event?.posterUrl);
  return (
    <>
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
      <Group label={L.poster} testID="wizard-poster">
        {current ? <Photo source={current} style={styles.poster} accessibilityLabel={L.posterCurrent} /> : null}
        {poster ? <Muted variant="caption">{L.posterChosen}</Muted> : <Muted variant="caption">{L.posterHint}</Muted>}
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
          {event?.posterUrl || poster ? L.posterReplace : L.posterPick}
        </Button>
        {poster ? (
          <Button variant="plate" icon="close" onPress={() => setPoster(null)}>
            {L.posterRemove}
          </Button>
        ) : null}
      </Group>
    </>
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

export function TicketingStep({ d, set, editing, event, verified, openStructure }: StepContext) {
  const R = L.recap;
  const start = d.multiDay
    ? `${sortedDraftDays(d)
        .map((x) => `${x.date} ${x.startTime}–${x.endTime}`)
        .join(", ")} · ${dayAccessLabels[d.dayAccess]}`
    : d.startsAt
      ? d.startsAt.replace("T", " ")
      : "—";
  return (
    <>
      <Notice>
        {d.publicAccess === "free_reservation" || d.publicAccess === "paid_orasso"
          ? L.ticketingNoticeOrasso
          : L.ticketingNoticeOther}
      </Notice>
      <Group label={L.staffTitle} testID="wizard-shop">
        <CheckboxField
          label={shopLabels.wizardCheckbox}
          checked={d.shopEnabled}
          onChange={(v) => set("shopEnabled", v)}
        />
        <Muted variant="caption">{shopLabels.wizardHint}</Muted>
      </Group>
      <Group label={L.recapTitle}>
        <Plate style={wizardStyles.block} testID="wizard-recap">
          <RecapRow label={R.format} value={eventFormatLabels[d.format]} />
          <RecapRow label={R.title} value={d.title || "—"} />
          <RecapRow label={d.multiDay ? eventDaysLabels.days : R.start} value={start} />
          <RecapRow label={R.address} value={[d.addressLine, d.postalCode, d.city].filter(Boolean).join(" ") || "—"} />
          <RecapRow label={R.vehicles} value={d.vehicleTypes.map((v) => vehicleTypeLabels[v]).join(", ")} />
          <RecapRow label={R.places} value={d.unlimited ? L.unlimited : d.capacity} />
          <RecapRow label={R.public} value={eventPublicAccessLabels[d.publicAccess]} />
          <RecapRow label={R.admission} value={eventAdmissionLabels[d.admission]} />
          <RecapRow label={R.zones} value={d.zones.map((z) => z.code).join(", ") || R.none} />
        </Plate>
      </Group>
      {!verified ? (
        <Plate kind="note" style={wizardStyles.block} testID="wizard-not-verified">
          <Muted variant="body">{L.notVerified}</Muted>
          <Button variant="plate" icon="check" onPress={openStructure}>
            {L.publishBlockedLink}
          </Button>
        </Plate>
      ) : null}
      {editing && event?.status === "published" ? <Notice>{L.publishedWarning}</Notice> : null}
    </>
  );
}

const styles = StyleSheet.create({
  rules: { minHeight: 240 },
  poster: { width: "100%", aspectRatio: 4 / 5 },
  code: { flex: 1, minWidth: 110 },
});
