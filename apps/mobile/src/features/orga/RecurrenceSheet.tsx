// Récurrence d'un événement depuis l'appli (lot 35b, D20), comme la page de l'événement du site : « chaque premier
// dimanche du mois » ou « toutes les N semaines », N occurrences créées une seule fois en brouillon. L'aperçu des dates
// vient de la règle partagée (`recurrenceOccurrences`) ; l'API les crée (`POST /events/:id/recurrence`).
import { Button, SelectField, Text, useTheme } from "@orasso/design-system/native";
import {
  describeRecurrence,
  type EventOrganizer,
  eventEditorLabels as L,
  RECURRENCE_MAX_COUNT,
  type RecurrenceRule,
  recurrenceOccurrences,
  wallTime,
  weekdayNames,
} from "@orasso/shared";
import { useEffect, useState } from "react";

import { formatDay } from "@/lib/format";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";

const NTH = [1, 2, 3, 4, -1] as const;

/** Règle saisie → règle envoyée (même construction que le formulaire du site). */
export function recurrenceRuleOf(v: {
  kind: "weekly" | "monthly_nth_weekday";
  interval: string;
  nth: string;
  weekday: string;
  count: string;
}): RecurrenceRule {
  return v.kind === "weekly"
    ? { kind: "weekly", interval: Number(v.interval) || 1, count: Number(v.count) }
    : { kind: "monthly_nth_weekday", nth: Number(v.nth), weekday: Number(v.weekday), count: Number(v.count) };
}

export function RecurrenceSheet({
  visible,
  event,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  event: EventOrganizer;
  busy: boolean;
  error: string | null;
  onConfirm: (rule: RecurrenceRule) => void;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const origin = wallTime(new Date(event.startsAt));
  const originWeekday = new Date(Date.UTC(origin.year, origin.month - 1, origin.day)).getUTCDay();
  const [kind, setKind] = useState<"weekly" | "monthly_nth_weekday">("monthly_nth_weekday");
  const [interval, setInterval] = useState("1");
  const [nth, setNth] = useState("1");
  const [weekday, setWeekday] = useState(String(originWeekday));
  const [count, setCount] = useState("5");
  useEffect(() => {
    if (visible) setWeekday(String(originWeekday));
  }, [visible, originWeekday]);
  const rule = recurrenceRuleOf({ kind, interval, nth, weekday, count });
  const dates = recurrenceOccurrences(new Date(event.startsAt), new Date(event.endsAt), rule);
  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={L.recurrenceTitle}>
      <Text variant="title" color={t.color.ink}>
        {L.recurrenceTitle}
      </Text>
      <Muted variant="body">{L.recurrenceIntro}</Muted>
      <SelectField
        label={L.recurrenceKind}
        value={kind}
        onValueChange={(v) => setKind(v as typeof kind)}
        options={[
          { value: "monthly_nth_weekday", label: L.recurrenceMonthly },
          { value: "weekly", label: L.recurrenceWeekly },
        ]}
      />
      {kind === "weekly" ? (
        <SelectField
          label={L.recurrenceEvery}
          value={interval}
          onValueChange={setInterval}
          options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: L.recurrenceWeeks(n) }))}
        />
      ) : (
        <>
          <SelectField
            label={L.recurrenceNth}
            value={nth}
            onValueChange={setNth}
            options={NTH.map((n) => ({ value: String(n), label: L.nth[n] ?? String(n) }))}
          />
          <SelectField
            label={L.recurrenceWeekday}
            value={weekday}
            onValueChange={setWeekday}
            options={weekdayNames.map((label, i) => ({ value: String(i), label }))}
          />
        </>
      )}
      <SelectField
        label={L.recurrenceCount}
        value={count}
        onValueChange={setCount}
        options={Array.from({ length: RECURRENCE_MAX_COUNT }, (_, i) => ({
          value: String(i + 1),
          label: String(i + 1),
        }))}
        help={L.recurrenceCountHint}
      />
      <Muted variant="caption" testID="recurrence-preview">
        {`${describeRecurrence(rule)} : ${dates.map((o) => formatDay(o.startsAt)).join(" · ") || L.recurrenceNone}.`}
      </Muted>
      {dates.length > 0 ? <Muted variant="caption">{L.recurrenceConfirm(dates.length)}</Muted> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button
        variant="secondary"
        icon="calendar"
        loading={busy}
        disabled={busy || dates.length === 0}
        onPress={() => onConfirm(rule)}
        fullWidth
        testID="recurrence-create"
      >
        {L.recurrenceCreate}
      </Button>
      <Button variant="plate" icon="close" onPress={onClose} disabled={busy} fullWidth>
        {L.cancel}
      </Button>
    </AppSheet>
  );
}
