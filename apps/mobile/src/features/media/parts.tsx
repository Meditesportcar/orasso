// Morceaux communs des écrans de la casquette Média (lot 55) : la ligne d'événement de l'Explorer et de Mon agenda
// (souche de date, titre, détail, état à droite), l'état d'une accréditation en pastille, la bande de la semaine.
import { Button, Chip, Icon, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { mediaAppLabels as L } from "@orasso/shared";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { stubOf } from "@/features/explorer/EventCardV2";
import { type CardState, cardStateLabel, type WeekDay } from "./model";

const { space1, space2, space3 } = tokens.spacing;

/** Une ligne d'événement (prototype `.tz-it`) : souche de date, titre jamais tronqué, détail, état ou action à droite. */
export function EventLine({
  startsAt,
  title,
  detail,
  right,
  onPress,
  testID,
}: {
  startsAt: string;
  title: string;
  detail: string;
  right?: ReactNode;
  onPress: () => void;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  const stub = stubOf(startsAt);
  return (
    <Plate style={styles.line} testID={testID}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${title}, ${detail}`}
        onPress={onPress}
        style={styles.press}
      >
        <View style={[styles.stub, { borderRightColor: c.plateLine }]}>
          <Text variant="meta" color={c.plateMuted}>
            {stub.day}
          </Text>
          <Text variant="posterM" color={c.plateInk}>
            {stub.date}
          </Text>
          <Text variant="meta" color={c.plateMuted}>
            {stub.month}
          </Text>
        </View>
        <View style={styles.text}>
          <Text variant="bodyStrong" color={c.plateInk}>
            {title}
          </Text>
          <Text variant="meta" color={c.plateMuted}>
            {detail}
          </Text>
        </View>
      </Pressable>
      {right ? <View style={styles.right}>{right}</View> : null}
    </Plate>
  );
}

/** L'état d'une accréditation à droite d'une ligne : pastille, « Demander » ou rien quand elle est fermée. */
export function StateAction({
  state,
  onRequest,
  invitation,
}: {
  state: CardState;
  onRequest: () => void;
  /** L'API a répondu « sur invitation » : plus de demande possible. */
  invitation?: boolean;
}) {
  if (invitation) return <Chip surface="plate">{L.invitation}</Chip>;
  if (state === "request") {
    return (
      <Button variant="plate" icon="send" onPress={onRequest} testID="media-request">
        {L.request}
      </Button>
    );
  }
  if (state === "closed") return <Chip surface="plate">{L.closed}</Chip>;
  return (
    <Chip surface="plate" selected={state === "accredited"}>
      {cardStateLabel[state]}
    </Chip>
  );
}

/** « Garder » : le cœur plein quand l'événement est dans l'agenda. */
export function KeepButton({ kept, title, onPress }: { kept: boolean; title: string; onPress: () => void }) {
  const { t } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={kept ? L.keptA11y(title) : L.keepA11y(title)}
      accessibilityState={{ selected: kept }}
      onPress={onPress}
      hitSlop={6}
      style={[styles.keep, { borderColor: kept ? t.color.accent : t.color.plateChip }]}
      testID="media-keep"
    >
      <Icon name="heart" size={18} color={kept ? t.color.accent : t.color.plateMuted} />
      <Text variant="label" color={kept ? t.color.accent : t.color.plateMuted}>
        {kept ? L.kept : L.keep}
      </Text>
    </Pressable>
  );
}

/** La bande des sept jours de la semaine (prototype `.tz-week`) : les jours couverts sont marqués. */
export function WeekStrip({ days }: { days: readonly WeekDay[] }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Plate style={styles.week} testID="media-week">
      {days.map((d) => (
        <View
          key={d.date}
          style={[styles.weekDay, d.covered && { backgroundColor: c.accent }]}
          accessible
          accessibilityLabel={L.weekDayA11y(`${d.letter} ${d.day}`, d.covered)}
        >
          <Text variant="label" color={d.covered ? c.accentInk : c.plateMuted}>
            {d.letter}
          </Text>
          <Text variant="bodyStrong" color={d.covered ? c.accentInk : c.plateInk}>
            {d.day}
          </Text>
        </View>
      ))}
    </Plate>
  );
}

const styles = StyleSheet.create({
  line: { gap: space2, padding: space2 },
  press: { flexDirection: "row", alignItems: "center", gap: space3 },
  stub: {
    width: tokens.spacing.space12 + space1,
    alignItems: "center",
    borderRightWidth: 1.5,
    borderStyle: "dashed",
    paddingRight: space2,
  },
  text: { flex: 1, gap: space1 },
  right: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: space2 },
  keep: {
    flexDirection: "row",
    alignItems: "center",
    gap: space1,
    minHeight: tokens.spacing.touch,
    paddingHorizontal: space2,
    borderRadius: tokens.radius.radiusPill,
    borderWidth: 1.5,
  },
  week: { flexDirection: "row", justifyContent: "space-between", padding: space2, gap: space1 },
  weekDay: {
    flex: 1,
    alignItems: "center",
    paddingVertical: space1,
    borderRadius: tokens.radius.radiusSm,
  },
});
