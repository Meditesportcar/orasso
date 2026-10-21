// Temps 6 (`s-create` data-cs 5) : « Le règlement » — multiligne avec compteur, modèles (Orasso, Nocturne, Expo),
// « Reprendre le dernier » (règlement du dernier événement de la structure), consignes aux retenus. Un modèle ne
// remplace pas un règlement déjà saisi sans le demander (relecture du lot 53).
import { Button, Chip, ChipRow } from "@orasso/design-system/web";
import {
  defaultEventRules,
  eventEditorLabels as E,
  type EventCard,
  type EventOrganizer,
  rulesCount,
  rulesReplaceNeedsConfirm,
  rulesTemplates,
  wizardV2Labels as W,
} from "@orasso/shared";
import { useState } from "react";
import { apiFetch } from "../../lib/api.client";
import { TextAreaField } from "../Fields";
import type { StepProps } from "./types";

type Replacement = { text: string; what: string; note: string };

export function RulesStep({
  d,
  set,
  structureId,
  eventId,
}: StepProps & { structureId: string; eventId: string | null }) {
  const [note, setNote] = useState<string | null>(null);
  const [asking, setAsking] = useState<Replacement | null>(null);
  const count = rulesCount(d.rulesText);

  const apply = ({ text, note: done }: Replacement) => {
    set("rulesText", text);
    setNote(done);
    setAsking(null);
  };
  /** Remplace le règlement : directement s'il est vide (ou encore le modèle prérempli), sinon après confirmation. */
  const offer = (r: Replacement) => (rulesReplaceNeedsConfirm(d.rulesText, r.text) ? setAsking(r) : apply(r));

  async function takeLast() {
    const list = await apiFetch<EventCard[]>(`/structures/${structureId}/events`);
    const last = list.ok
      ? [...list.data].filter((e) => e.id !== eventId).sort((a, b) => b.startsAt.localeCompare(a.startsAt))
      : [];
    for (const e of last) {
      const full = await apiFetch<EventOrganizer>(`/events/${e.id}`);
      if (full.ok && full.data.rulesText?.trim()) {
        return offer({ text: full.data.rulesText, what: W.rulesWhatLast, note: W.rulesTaken(full.data.title) });
      }
    }
    setNote(W.rulesLastNone);
  }

  return (
    <>
      <ChipRow className="s-chips-wrap">
        <Chip
          onClick={() =>
            offer({ text: defaultEventRules, what: W.rulesWhatTemplate(W.rulesOrasso), note: W.rulesInserted })
          }
        >
          {W.rulesOrasso}
        </Chip>
        {rulesTemplates.map((t) => (
          <Chip
            key={t.id}
            onClick={() => offer({ text: t.text, what: W.rulesWhatTemplate(t.label), note: W.rulesInserted })}
          >
            {t.label}
          </Chip>
        ))}
        <Chip onClick={() => void takeLast()} data-testid="wizard-rules-last">
          {W.rulesLast}
        </Chip>
      </ChipRow>
      {asking ? (
        <div className="s-notice s-stack s-stack--tight" role="alertdialog" data-testid="wizard-rules-replace">
          <strong>{W.rulesReplaceTitle}</strong>
          <span>{W.rulesReplaceBody(asking.what)}</span>
          <div className="s-row">
            <Button
              variant="secondary"
              icon="check"
              onClick={() => apply(asking)}
              data-testid="wizard-rules-replace-yes"
            >
              {W.rulesReplaceConfirm}
            </Button>
            <Button variant="secondary" icon="close" onClick={() => setAsking(null)}>
              {W.rulesReplaceKeep}
            </Button>
          </div>
        </div>
      ) : null}
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
