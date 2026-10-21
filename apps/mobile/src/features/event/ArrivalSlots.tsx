// Créneaux d'arrivée de la fiche v2 (lot 44, `s-event` ; données du lot 47) : deux plaques distinctes, exposants (avec
// véhicule, sur l'aplat de l'affiche) et public, l'horaire en grands chiffres, Strict ou Conseillé, la note.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { type ArrivalSlot, type Arrivals, eventPageLabels as L } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { Num, Tag } from "@/features/passionne/kit";
import { SecHead } from "@/ui/SecHead";

const { space1, space2, space3 } = tokens.spacing;

/** « 18:30 – 19:15 » ou « dès 19:30 ». */
export const slotTime = (slot: ArrivalSlot): string => (slot.to ? `${slot.from} – ${slot.to}` : `dès ${slot.from}`);

function Slot({ title, slot, mine }: { title: string; slot: ArrivalSlot; mine: boolean }) {
  const { t } = useTheme();
  const ink = mine ? t.color.posterInk : t.color.ink;
  const muted = mine ? t.color.posterMuted : t.color.inkMuted;
  const body = (
    <>
      <Text variant="label" color={muted}>
        {title}
      </Text>
      <Num size={30} color={ink}>
        {slotTime(slot)}
      </Num>
      <Tag kind={slot.strict ? "acc" : "line"} onPoster={mine}>
        {slot.strict ? L.strict : L.advised}
      </Tag>
      {slot.note ? (
        <Text variant="caption" color={ink} style={styles.note}>
          {slot.note}
        </Text>
      ) : null}
    </>
  );
  return (
    <View
      style={[
        styles.slot,
        { backgroundColor: mine ? t.color.poster : t.color.surface, boxShadow: t.shadow.shadowCard },
      ]}
      testID={mine ? "arrival-exhibitors" : "arrival-public"}
    >
      {body}
    </View>
  );
}

/** `entranceNote` : la précision pour l'entrée saisie dans l'assistant (lot 53), sous les créneaux. */
export function ArrivalSlots({ arrivals, entranceNote }: { arrivals: Arrivals; entranceNote?: string | null }) {
  const { t } = useTheme();
  if (!arrivals.exhibitors && !arrivals.public && !entranceNote) return null;
  return (
    <View style={styles.wrap} testID="arrival-slots">
      <SecHead title={L.arrivals} />
      <View style={styles.row}>
        {arrivals.exhibitors ? <Slot title={L.arrivalExhibitors} slot={arrivals.exhibitors} mine /> : null}
        {arrivals.public ? <Slot title={L.arrivalPublic} slot={arrivals.public} mine={false} /> : null}
      </View>
      {entranceNote ? (
        <View style={[styles.entrance, { backgroundColor: t.color.surface }]} testID="arrival-entrance">
          <Text variant="label" color={t.color.inkMuted}>
            {L.entranceNote}
          </Text>
          <Text variant="body" color={t.color.ink}>
            {entranceNote}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space2 },
  row: { flexDirection: "row", gap: space2 },
  slot: { flex: 1, gap: space1 + 2, padding: space3, borderRadius: 16 },
  note: { fontSize: 12.5, lineHeight: 17, opacity: 0.85 },
  entrance: { gap: space1, padding: space3, borderRadius: 16 },
});
