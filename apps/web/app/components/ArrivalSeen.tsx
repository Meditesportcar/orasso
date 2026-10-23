// Lot 47 : horaire d'arrivée des exposants à la candidature (prototype DA v2, `s-create` étape « Les arrivées » :
// « Je coche “J'ai vu” et je peux laisser une note »). Case obligatoire quand l'événement a un créneau exposants ;
// rien n'est affiché sinon. Utilisé par la candidature (contrôlé), la confirmation de venue en crew, l'inscription
// du crew et l'acceptation d'une invitation (formulaires : champs `arrivalSeen` et `arrivalNote`).
import { CheckboxField, TextField } from "@orasso/design-system/web";
import { ARRIVAL_NOTE_MAX, type ArrivalSlot, arrivalLabel, arrivalTexts } from "@orasso/shared";

type Controlled = { seen: boolean; onSeen: (seen: boolean) => void; note: string; onNote: (note: string) => void };

export function ArrivalSeen({ slot, ...control }: { slot: ArrivalSlot | null } & Partial<Controlled>) {
  if (!slot) return null;
  const c = control.onSeen && control.onNote ? (control as Controlled) : null;
  return (
    <div className="s-card s-stack s-stack--tight" data-testid="arrival-seen">
      <div className="o-t-label s-label">{arrivalTexts.exhibitors}</div>
      <p className="o-t-body">
        {/* Lot M4 : jamais « conseillé » (correction de Damien, dans `arrivalLabel`). */}
        <strong>{arrivalLabel(slot)}</strong>
        {slot.note ? ` · ${slot.note}` : ""}
      </p>
      {slot.strict ? <p className="o-t-caption s-muted">{arrivalTexts.strictHint}</p> : null}
      {c ? (
        <CheckboxField
          checked={c.seen}
          onChange={(e) => c.onSeen(e.currentTarget.checked)}
          label={arrivalTexts.seenLabel}
          data-testid="arrival-seen-check"
        />
      ) : (
        <CheckboxField name="arrivalSeen" label={arrivalTexts.seenLabel} data-testid="arrival-seen-check" />
      )}
      {c ? (
        <TextField
          label={arrivalTexts.noteLabel}
          value={c.note}
          maxLength={ARRIVAL_NOTE_MAX}
          placeholder={arrivalTexts.notePlaceholder}
          onChange={(e) => c.onNote(e.currentTarget.value)}
          data-testid="arrival-note"
        />
      ) : (
        <TextField
          label={arrivalTexts.noteLabel}
          name="arrivalNote"
          maxLength={ARRIVAL_NOTE_MAX}
          placeholder={arrivalTexts.notePlaceholder}
          data-testid="arrival-note"
        />
      )}
    </div>
  );
}

/** Corps envoyé à l'API : la case et la note seulement quand il y a un créneau exposants. */
export const arrivalBody = (slot: ArrivalSlot | null, seen: boolean, note: string) =>
  slot ? { arrivalSeen: seen, arrivalNote: note.trim() || null } : {};
