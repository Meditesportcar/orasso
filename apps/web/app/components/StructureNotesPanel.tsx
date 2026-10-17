// Onglet « Notes internes » de la structure (lot 27, docs/02) : recherche par pseudo dans les notes de la structure,
// puis lecture, ajout et retrait par personne. Réservé aux organisateurs (propriétaire, co-organisateurs).
import { Button, TextField } from "@orasso/design-system/web";
import { afterEventLabels as L, type StructureNoteView } from "@orasso/shared";
import { useState } from "react";

import { apiFetch } from "../lib/api.client";
import { StructureNotes } from "./StructureNotes";

type Group = { userId: string; pseudo: string; notes: StructureNoteView[] };

function groupByPerson(items: StructureNoteView[]): Group[] {
  const groups = new Map<string, Group>();
  for (const n of items) {
    const g = groups.get(n.subjectUserId) ?? { userId: n.subjectUserId, pseudo: n.subjectPseudo, notes: [] };
    g.notes.push(n);
    groups.set(n.subjectUserId, g);
  }
  return [...groups.values()];
}

export function StructureNotesPanel({
  structureId,
  initial,
  writable,
}: {
  structureId: string;
  initial: StructureNoteView[];
  writable: boolean;
}) {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [groups, setGroups] = useState<Group[]>(groupByPerson(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setBusy(true);
    setError(null);
    const q = query.trim();
    const res = await apiFetch<{ items: StructureNoteView[] }>(
      `/structures/${structureId}/notes${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    );
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    setGroups(groupByPerson(res.data.items));
    setSearched(q);
  }

  return (
    <section className="orga__panel s-stack" aria-labelledby="notes-title" data-testid="structure-notes-panel">
      <h2 className="s-h2" id="notes-title">
        {L.notesTitle}
      </h2>
      <p className="s-muted">{L.notesIntro}</p>
      <form
        className="s-row"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <TextField
          label={L.notesSearch}
          name="q"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          autoComplete="off"
          maxLength={40}
        />
        <Button type="submit" variant="secondary" icon="search" loading={busy} data-testid="notes-search">
          {L.notesSearch}
        </Button>
      </form>
      {error && (
        <p className="s-error" role="alert">
          {error}
        </p>
      )}
      {groups.length === 0 && !searched && <p className="o-t-caption s-muted">{L.notesEmpty}</p>}
      {groups.map((g) => (
        <div key={g.userId} className="s-stack s-stack--tight" data-testid="notes-person">
          <h3 className="o-t-label s-label">
            {g.pseudo} · {L.notesCount(g.notes.length)}
          </h3>
          <StructureNotes structureId={structureId} pseudo={g.pseudo} initial={g.notes} writable={writable} />
        </div>
      ))}
      {searched && groups.length === 0 && (
        <div className="s-stack s-stack--tight">
          <p className="o-t-caption s-muted">
            {L.notesEmpty} ({searched})
          </p>
          {writable && <StructureNotes key={searched} structureId={structureId} pseudo={searched} initial={[]} />}
        </div>
      )}
    </section>
  );
}
