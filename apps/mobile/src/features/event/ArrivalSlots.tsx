// Créneaux d'arrivée de la fiche v2 (lot 44, `s-event` ; données du lot 47) : deux plaques distinctes, exposants (avec
// véhicule, sur l'aplat de l'affiche) et public, l'horaire en grands chiffres, Strict ou Conseillé, la note.
import { Chip, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type ArrivalSlot, type Arrivals, eventPageLabels as L } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

const { space1, space2, space3 } = tokens.spacing;

/** « 18:30 – 19:15 » ou « dès 19:30 ». */
export const slotTime = (slot: ArrivalSlot): string => (slot.to ? `${slot.from} – ${slot.to}` : `dès ${slot.from}`);

function Slot({ title, slot, mine }: { title: string; slot: ArrivalSlot; mine: boolean }) {
  const { t } = useTheme();
  const ink = mine ? t.color.posterInk : t.color.plateInk;
  const muted = mine ? t.color.posterMuted : t.color.plateMuted;
  const body = (
    <>
      <Text variant="label" color={muted}>
        {title}
      </Text>
      <Text variant="numberNarrow" color={ink} style={styles.time}>
        {slotTime(slot)}
      </Text>
      <View style={styles.tag}>
        <Chip variant={slot.strict ? "accent" : "default"} surface={mine ? "surface" : "plate"}>
          {slot.strict ? L.strict : L.advised}
        </Chip>
      </View>
      {slot.note ? (
        <Text variant="meta" color={muted}>
          {slot.note}
        </Text>
      ) : null}
    </>
  );
  return mine ? (
    <View style={[styles.slot, { backgroundColor: t.color.poster }]} testID="arrival-exhibitors">
      {body}
    </View>
  ) : (
    <Plate style={styles.slot} testID="arrival-public">
      {body}
    </Plate>
  );
}

export function ArrivalSlots({ arrivals }: { arrivals: Arrivals }) {
  const { t } = useTheme();
  if (!arrivals.exhibitors && !arrivals.public) return null;
  return (
    <View style={styles.wrap} testID="arrival-slots">
      <Text variant="title" color={t.color.ink} accessibilityRole="header">
        {L.arrivals}
      </Text>
      <View style={styles.row}>
        {arrivals.exhibitors ? <Slot title={L.arrivalExhibitors} slot={arrivals.exhibitors} mine /> : null}
        {arrivals.public ? <Slot title={L.arrivalPublic} slot={arrivals.public} mine={false} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space2 },
  row: { flexDirection: "row", gap: space2 },
  slot: { flex: 1, gap: space1, padding: space3, borderRadius: tokens.radius.radiusMd },
  time: { fontSize: 28, lineHeight: 30 },
  tag: { alignSelf: "flex-start" },
});
