// Lot 47 : horaire d'arrivée des exposants (prototype DA v2, `s-create` étape « Les arrivées » : « Je coche “J'ai vu”
// et je peux laisser une note »). Rien n'est affiché sans créneau exposants. Candidature, confirmation de venue en
// crew, inscription du crew (chef) et acceptation d'une invitation.
import { CheckboxField, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { ARRIVAL_NOTE_MAX, type ArrivalSlot, arrivalLabel, arrivalTexts } from "@orasso/shared";
import { StyleSheet } from "react-native";

export function ArrivalSeen({
  slot,
  seen,
  onSeen,
  note,
  onNote,
}: {
  slot: ArrivalSlot | null | undefined;
  seen: boolean;
  onSeen: (seen: boolean) => void;
  note: string;
  onNote: (note: string) => void;
}) {
  const { t } = useTheme();
  if (!slot) return null;
  return (
    <Plate style={styles.plate} testID="arrival-seen">
      <Text variant="label" color={t.color.plateMuted}>
        {arrivalTexts.exhibitors}
      </Text>
      <Text variant="body" color={t.color.plateInk}>
        {arrivalLabel(slot)}
        {slot.note ? ` · ${slot.note}` : ""}
      </Text>
      {slot.strict ? (
        <Text variant="caption" color={t.color.plateMuted}>
          {arrivalTexts.strictHint}
        </Text>
      ) : null}
      <CheckboxField label={arrivalTexts.seenLabel} checked={seen} onChange={onSeen} />
      <TextField
        label={arrivalTexts.noteLabel}
        value={note}
        onChangeText={onNote}
        maxLength={ARRIVAL_NOTE_MAX}
        placeholder={arrivalTexts.notePlaceholder}
        testID="arrival-note"
      />
    </Plate>
  );
}

/** Corps envoyé à l'API : la case et la note seulement quand il y a un créneau exposants. */
export const arrivalBody = (slot: ArrivalSlot | null | undefined, seen: boolean, note: string) =>
  slot ? { arrivalSeen: seen, arrivalNote: note.trim() || null } : {};

const styles = StyleSheet.create({ plate: { gap: tokens.spacing.space2, padding: tokens.spacing.space3 } });
