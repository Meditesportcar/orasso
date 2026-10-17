// Notes internes d'une structure sur une personne (lot 27, docs/01) : privées, factuelles, jamais exportées. Dans la fiche
// de tri, la liste des candidatures et l'onglet « Notes internes » de la structure.
import { Button } from "@orasso/design-system/web";
import { afterEventLabels as L, STRUCTURE_NOTE_MAX, type StructureNoteView } from "@orasso/shared";
import { useState } from "react";

import { apiFetch } from "../lib/api.client";
import { formatDateTime } from "../lib/format";
import { TextAreaField } from "./Fields";

export function StructureNotes({
  structureId,
  pseudo,
  eventId,
  initial,
  writable = true,
}: {
  structureId: string;
  /** La personne concernée (par son pseudo : le nom n'est pas nécessaire). */
  pseudo: string;
  eventId?: string;
  initial: StructureNoteView[];
  /** Faux pour une structure suspendue : lecture seule. */
  writable?: boolean;
}) {
  const [notes, setNotes] = useState(initial);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    const res = await apiFetch<StructureNoteView>(`/structures/${structureId}/notes`, {
      method: "POST",
      json: { pseudo, eventId, body: draft },
    });
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    setNotes((cur) => [res.data, ...cur]);
    setDraft("");
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    const res = await apiFetch<StructureNoteView>(`/structure-notes/${editing.id}`, {
      method: "PATCH",
      json: { body: editing.body },
    });
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    setNotes((cur) => cur.map((n) => (n.id === res.data.id ? res.data : n)));
    setEditing(null);
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/structure-notes/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    setNotes((cur) => cur.filter((n) => n.id !== id));
  }

  return (
    <div className="s-stack s-stack--tight" data-testid="structure-notes">
      <p className="o-t-caption s-muted">
        {L.notesPrivate}. {L.notesHelp}
      </p>
      {notes.length === 0 ? (
        <p className="o-t-caption s-muted">{L.notesEmpty}</p>
      ) : (
        <ul className="ae-notes">
          {notes.map((n) => (
            <li key={n.id} className="ae-note" data-testid="structure-note">
              {editing?.id === n.id ? (
                <>
                  <TextAreaField
                    label={L.notesBody}
                    rows={3}
                    maxLength={STRUCTURE_NOTE_MAX}
                    value={editing.body}
                    onChange={(e) => setEditing({ id: n.id, body: e.currentTarget.value })}
                  />
                  <div className="s-row">
                    <Button variant="secondary" icon="check" loading={busy} onClick={() => void save()}>
                      {L.notesSave}
                    </Button>
                    <Button variant="secondary" icon="close" disabled={busy} onClick={() => setEditing(null)}>
                      Annuler
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="ae-note__text o-t-body">{n.body}</p>
                  <span className="o-t-caption s-muted">
                    {formatDateTime(n.createdAt)} · {L.notesBy(n.authorPseudo)}
                    {n.eventTitle ? ` · ${n.eventTitle}` : ""}
                  </span>
                  {writable && (
                    <div className="s-row">
                      <Button
                        variant="secondary"
                        icon="incident"
                        disabled={busy}
                        onClick={() => setEditing({ id: n.id, body: n.body })}
                      >
                        {L.notesEdit}
                      </Button>
                      <Button variant="secondary" icon="close" disabled={busy} onClick={() => void remove(n.id)}>
                        {L.notesDelete}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {writable && (
        <form
          className="s-stack s-stack--tight"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <TextAreaField
            label={L.notesAdd}
            rows={2}
            maxLength={STRUCTURE_NOTE_MAX}
            value={draft}
            onChange={(e) => setDraft(e.currentTarget.value)}
            placeholder="Fait précis, sans jugement."
          />
          {error && (
            <p className="s-error" role="alert">
              {error}
            </p>
          )}
          <div className="s-row">
            <Button type="submit" variant="secondary" icon="add" loading={busy} disabled={!draft.trim()}>
              {L.notesSave}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
