import { Button, CheckboxField, Chip, SelectField, StatusBadge, TextField } from "@orasso/design-system/web";
import {
  type ApplicationForTriage,
  type Category,
  gradeLabels,
  grades,
  type RefusalReason,
  refusalReasonLabels,
  refusalReasons,
  type TriageDecision,
} from "@orasso/shared";
import { useState } from "react";
import { Form } from "react-router";

import { apiFetch } from "../lib/api.client";
import { formatDayShort } from "../lib/format";
import { badgeFor } from "../lib/status";

const STATUS_OPTIONS = [
  { value: "", label: "Tous les statuts" },
  { value: "pending", label: "En attente" },
  { value: "accepted", label: "Retenues" },
  { value: "waitlisted", label: "Liste d'attente" },
  { value: "refused", label: "Refusées" },
];

const SORT_OPTIONS = [
  { value: "created_at", label: "Plus anciennes d'abord" },
  { value: "year", label: "Année du véhicule" },
  { value: "pseudo", label: "Pseudo" },
];

export type ListFilters = { q?: string; status?: string; categoryId?: string; grade?: string; sort?: string };

/** Vue liste : filtres, sélection multiple, décisions en masse (chaque candidature réussit ou échoue seule). */
export function TriageList({
  eventId,
  items,
  nextHref,
  filters,
  categories,
  canDecide,
  onChanged,
}: {
  eventId: string;
  items: ApplicationForTriage[];
  nextHref: string | null;
  filters: ListFilters;
  categories: Category[];
  canDecide: boolean;
  onChanged: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [refusing, setRefusing] = useState(false);
  const [reasons, setReasons] = useState<RefusalReason[]>([]);
  const [note, setNote] = useState("");
  const [send, setSend] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const allIds = items.map((i) => i.id);
  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  async function run(decision: TriageDecision) {
    if (decision === "refuse" && reasons.length === 0) return setMessage("Choisis au moins un motif.");
    if (decision === "refuse" && reasons.includes("other") && !note.trim()) {
      return setMessage("Motif « Autre » : ajoute une note.");
    }
    setBusy(true);
    setMessage(null);
    const res = await apiFetch<{ results: { id: string; ok: boolean; error?: string }[] }>(
      `/events/${eventId}/applications/decide-many`,
      {
        method: "POST",
        json: {
          ids: selected,
          decision,
          ...(decision === "refuse" ? { reasons, note: note.trim() || null, sendReasons: send } : {}),
        },
      },
    );
    setBusy(false);
    if (!res.ok) return setMessage(res.error.message);
    const failed = res.data.results.filter((r) => !r.ok);
    setMessage(
      failed.length === 0
        ? `${res.data.results.length} décision${res.data.results.length > 1 ? "s" : ""} enregistrée${res.data.results.length > 1 ? "s" : ""}.`
        : `${res.data.results.length - failed.length} enregistrée(s), ${failed.length} refusée(s) par l'API (${[...new Set(failed.map((f) => f.error))].join(", ")}).`,
    );
    setSelected([]);
    setRefusing(false);
    setReasons([]);
    setNote("");
    onChanged();
  }

  return (
    <div className="s-stack" data-testid="triage-list">
      <Form method="get" className="s-filters orga__panel">
        <input type="hidden" name="vue" value="liste" />
        <TextField label="Recherche" name="q" defaultValue={filters.q} placeholder="Pseudo, marque, modèle" />
        <SelectField label="Statut" name="status" defaultValue={filters.status ?? ""} options={STATUS_OPTIONS} />
        <SelectField
          label="Catégorie"
          name="categoryId"
          defaultValue={filters.categoryId ?? ""}
          options={[{ value: "", label: "Toutes" }, ...categories.map((c) => ({ value: c.id, label: c.label }))]}
        />
        <SelectField
          label="Grade"
          name="grade"
          defaultValue={filters.grade ?? ""}
          options={[{ value: "", label: "Tous" }, ...grades.map((g) => ({ value: g, label: gradeLabels[g] }))]}
        />
        <SelectField label="Tri" name="sort" defaultValue={filters.sort ?? "created_at"} options={SORT_OPTIONS} />
        <Button type="submit" icon="search" variant="secondary">
          Filtrer
        </Button>
      </Form>

      {selected.length > 0 && canDecide && (
        <div className="s-bulk" data-testid="bulk-bar">
          <strong>
            {selected.length} sélectionnée{selected.length > 1 ? "s" : ""}
          </strong>
          {refusing ? (
            <div className="s-stack s-stack--tight s-grow">
              <div className="tri__reasons">
                {refusalReasons.map((reason) => (
                  <CheckboxField
                    key={reason}
                    checked={reasons.includes(reason)}
                    onChange={() =>
                      setReasons((cur) => (cur.includes(reason) ? cur.filter((r) => r !== reason) : [...cur, reason]))
                    }
                    label={refusalReasonLabels[reason]}
                  />
                ))}
              </div>
              <textarea
                className="s-textarea o-t-body"
                rows={2}
                placeholder="Note (obligatoire pour « Autre »)"
                value={note}
                onChange={(e) => setNote(e.currentTarget.value)}
                aria-label="Note"
              />
              <CheckboxField
                checked={send}
                onChange={(e) => setSend(e.currentTarget.checked)}
                label="Envoyer les motifs aux candidats"
              />
              <div className="s-row">
                <Button variant="primary" icon="check" loading={busy} onClick={() => void run("refuse")}>
                  Confirmer le refus
                </Button>
                <Button variant="secondary" icon="close" onClick={() => setRefusing(false)}>
                  Annuler
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Button variant="primary" icon="check" loading={busy} onClick={() => void run("accept")}>
                Retenir
              </Button>
              <Button variant="plate" icon="wait" onClick={() => void run("waitlist")}>
                Liste d'attente
              </Button>
              <Button variant="plate" icon="close" onClick={() => setRefusing(true)}>
                Refuser
              </Button>
            </>
          )}
        </div>
      )}
      {message && (
        <p className="s-notice s-notice--ok" role="status">
          {message}
        </p>
      )}

      <div className="orga__panel s-table-wrap">
        <table className="s-table">
          <thead>
            <tr className="o-t-label">
              <th scope="col">
                <input
                  type="checkbox"
                  className="s-cb"
                  aria-label="Tout sélectionner"
                  checked={selected.length > 0 && selected.length === allIds.length}
                  onChange={(e) => setSelected(e.currentTarget.checked ? allIds : [])}
                  disabled={!canDecide}
                />
              </th>
              <th scope="col">Candidat</th>
              <th scope="col">Véhicule</th>
              <th scope="col">Année</th>
              <th scope="col">Statut</th>
              <th scope="col">Reçue</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const badge = badgeFor({ status: item.status, waitlistRank: item.waitlistRank });
              return (
                <tr key={item.id} data-testid="triage-row">
                  <td>
                    <input
                      type="checkbox"
                      className="s-cb"
                      aria-label={`Sélectionner ${item.applicant.pseudo}`}
                      checked={selected.includes(item.id)}
                      onChange={() => toggle(item.id)}
                      disabled={!canDecide}
                    />
                  </td>
                  <td>
                    {item.applicant.pseudo}{" "}
                    <span className="s-muted o-t-caption">· {gradeLabels[item.applicant.grade]}</span>
                  </td>
                  <td className="o-never-truncate">
                    {item.vehicle?.label ?? "—"}
                    {item.vehicle?.certified ? " · Certifié" : ""}
                  </td>
                  <td>{item.vehicle?.year ?? "—"}</td>
                  <td>
                    {badge ? <StatusBadge status={badge.status} rank={badge.rank} /> : <Chip>{item.status}</Chip>}
                  </td>
                  <td className="s-muted">{formatDayShort(item.createdAt)}</td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="s-muted">
                  Aucune candidature ne correspond à ces filtres.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {nextHref && (
        <div className="s-pager">
          <Button variant="secondary" icon="next" href={nextHref}>
            Page suivante
          </Button>
        </div>
      )}
    </div>
  );
}
