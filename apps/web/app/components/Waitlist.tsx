import { Button, StatusBadge } from "@orasso/design-system/web";
import type { ApplicationForTriage } from "@orasso/shared";
import { useEffect, useState } from "react";

import { apiFetch } from "../lib/api.client";
import { formatDateTime } from "../lib/format";

/** Liste d'attente : l'ordre se change avec les flèches (mémorisé tout de suite), « Retenir » prend la place. */
export function Waitlist({
  eventId,
  waitlisted,
  offered,
  canDecide,
  onChanged,
}: {
  eventId: string;
  waitlisted: ApplicationForTriage[];
  offered: ApplicationForTriage[];
  canDecide: boolean;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState(waitlisted);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => setRows(waitlisted), [waitlisted]);

  async function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(target, 0, item);
    setRows(next);
    const res = await apiFetch(`/events/${eventId}/waitlist/order`, {
      method: "PUT",
      json: { applicationIds: next.map((r) => r.id) },
    });
    if (!res.ok) {
      setMessage(res.error.message);
      onChanged();
    }
  }

  async function accept(id: string) {
    const res = await apiFetch(`/events/${eventId}/applications/${id}/decide`, {
      method: "POST",
      json: { decision: "accept" },
    });
    setMessage(res.ok ? "Candidature retenue." : res.error.message);
    onChanged();
  }

  return (
    <div className="s-stack" data-testid="waitlist">
      {message && (
        <p className="s-notice" role="status">
          {message}
        </p>
      )}
      {offered.length > 0 && (
        <section className="orga__panel s-stack s-stack--tight">
          <h2 className="s-h2">Offre de place en cours</h2>
          {offered.map((o) => (
            <div key={o.id} className="s-row s-row--between">
              <span>
                {o.applicant.pseudo} · {o.vehicle?.label ?? "—"}
              </span>
              <span className="s-muted o-t-caption">
                {o.offerExpiresAt ? `réponse avant ${formatDateTime(o.offerExpiresAt)}` : ""}
              </span>
            </div>
          ))}
        </section>
      )}
      <section className="orga__panel s-stack s-stack--tight">
        <h2 className="s-h2">Liste d'attente · {rows.length}</h2>
        {rows.length === 0 && <p className="s-muted">Personne en liste d'attente.</p>}
        {rows.map((row, i) => (
          <div key={row.id} className="s-row" data-testid="waitlist-row">
            <StatusBadge status="waitlist" rank={i + 1} animated={false} />
            <span className="s-grow o-never-truncate">
              {row.applicant.pseudo} · {row.vehicle?.label ?? "—"}
            </span>
            <Button
              variant="secondary"
              icon="skip"
              aria-label={`Monter ${row.applicant.pseudo}`}
              disabled={i === 0}
              onClick={() => void move(i, -1)}
            >
              Monter
            </Button>
            <Button
              variant="secondary"
              icon="skip"
              aria-label={`Descendre ${row.applicant.pseudo}`}
              disabled={i === rows.length - 1}
              onClick={() => void move(i, 1)}
            >
              Descendre
            </Button>
            {canDecide && (
              <Button variant="plate" icon="check" onClick={() => void accept(row.id)}>
                Retenir
              </Button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
