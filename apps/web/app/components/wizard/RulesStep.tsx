// Temps 6 (`s-create` data-cs 5) : « Le règlement » — multiligne avec compteur, modèles (Orasso, Nocturne, Expo),
// « Reprendre le dernier » (règlement du dernier événement de la structure), consignes aux retenus.
import { Chip, ChipRow } from "@orasso/design-system/web";
import {
  defaultEventRules,
  eventEditorLabels as E,
  type EventCard,
  type EventOrganizer,
  rulesCount,
  rulesTemplates,
  wizardV2Labels as W,
} from "@orasso/shared";
import { useState } from "react";
import { apiFetch } from "../../lib/api.client";
import { TextAreaField } from "../Fields";
import type { StepProps } from "./types";

export function RulesStep({
  d,
  set,
  structureId,
  eventId,
}: StepProps & { structureId: string; eventId: string | null }) {
  const [note, setNote] = useState<string | null>(null);
  const count = rulesCount(d.rulesText);

  async function takeLast() {
    const list = await apiFetch<EventCard[]>(`/structures/${structureId}/events`);
    const last = list.ok
      ? [...list.data].filter((e) => e.id !== eventId).sort((a, b) => b.startsAt.localeCompare(a.startsAt))
      : [];
    for (const e of last) {
      const full = await apiFetch<EventOrganizer>(`/events/${e.id}`);
      if (full.ok && full.data.rulesText?.trim()) {
        set("rulesText", full.data.rulesText);
        return setNote(W.rulesTaken(full.data.title));
      }
    }
    setNote(W.rulesLastNone);
  }

  return (
    <>
      <ChipRow className="s-chips-wrap">
        <Chip
          onClick={() => {
            set("rulesText", defaultEventRules);
            setNote(W.rulesInserted);
          }}
        >
          {W.rulesOrasso}
        </Chip>
        {rulesTemplates.map((t) => (
          <Chip
            key={t.id}
            onClick={() => {
              set("rulesText", t.text);
              setNote(W.rulesInserted);
            }}
          >
            {t.label}
          </Chip>
        ))}
        <Chip onClick={() => void takeLast()} data-testid="wizard-rules-last">
          {W.rulesLast}
        </Chip>
      </ChipRow>
      {note ? (
        <p className="o-t-caption s-muted" role="status">
          {note}
        </p>
      ) : null}
      <TextAreaField
        label={E.rules}
        name="rulesText"
        rows={8}
        value={d.rulesText}
        onChange={(e) => set("rulesText", e.currentTarget.value)}
        help={W.rulesCount(count.lines, count.chars)}
      />
      <TextAreaField
        label={E.instructions}
        name="instructions"
        value={d.instructions}
        onChange={(e) => set("instructions", e.currentTarget.value)}
        help={E.instructionsHint}
      />
    </>
  );
}
