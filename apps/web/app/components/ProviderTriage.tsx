import { Button, CheckboxField, Chip, ChipRow, StatusBadge } from "@orasso/design-system/web";
import {
  type ApplicationForTriage,
  type ApplicationStatus,
  afterEventLabels,
  canAccredit,
  instagramHandle,
  type RefusalReason,
  refusalReasonLabels,
  type TriageDecision,
  type VendorTypeCode,
} from "@orasso/shared";
import { useState } from "react";

import { apiFetch } from "../lib/api.client";
import { formatDateTime } from "../lib/format";
import { useRefusalReasons } from "../lib/lists";
import { badgeFor } from "../lib/status";
import { StructureNotes } from "./StructureNotes";
import "../styles/providers.css";

const FILTERS: { id: ApplicationStatus; label: string }[] = [
  { id: "pending", label: "À trier" },
  { id: "accepted", label: "Retenus" },
  { id: "waitlisted", label: "Liste d'attente" },
  { id: "refused", label: "Refusés" },
];

/**
 * Onglet « Prestataires » du tri (lot 21) : une file à part, hors capacité, avec les mêmes décisions que les
 * véhicules (retenir, liste d'attente manuelle, refuser avec motifs) et, pour un photographe retenu, « Média officiel ».
 */
export function ProviderTriage({
  eventId,
  structureId,
  items,
  canDecide,
  canAccreditMedia,
  onChanged,
}: {
  eventId: string;
  /** Notes internes de la structure sur le prestataire (lot 27) : organisateurs seulement. */
  structureId?: string;
  items: ApplicationForTriage[];
  canDecide: boolean;
  /** L'accréditation est réservée à l'organisateur (pas au staff de filtration). */
  canAccreditMedia: boolean;
  onChanged: () => void;
}) {
  // Lot 33 : motifs proposés par l'administration (repli sur les constantes partagées).
  const refusalReasons = useRefusalReasons();
  const [status, setStatus] = useState<ApplicationStatus>(() =>
    items.some((i) => i.status === "pending") ? "pending" : "accepted",
  );
  const [refusing, setRefusing] = useState<string | null>(null);
  const [reasons, setReasons] = useState<RefusalReason[]>([]);
  const [note, setNote] = useState("");
  const [send, setSend] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const shown = items.filter((i) =>
    (status === "waitlisted" ? ["waitlisted", "offered"] : [status]).includes(i.status),
  );
  const count = (s: ApplicationStatus) =>
    items.filter((i) => (s === "waitlisted" ? ["waitlisted", "offered"] : [s]).includes(i.status)).length;

  async function decide(item: ApplicationForTriage, decision: TriageDecision) {
    if (busy || !canDecide) return;
    if (decision === "refuse") {
      if (reasons.length === 0) return setMessage({ kind: "error", text: "Choisis au moins un motif." });
      if (reasons.includes("other") && !note.trim()) {
        return setMessage({ kind: "error", text: "Motif « Autre » : ajoute une note." });
      }
    }
    setBusy(item.id);
    setMessage(null);
    const res = await apiFetch(`/events/${eventId}/applications/${item.id}/decide`, {
      method: "POST",
      json: decision === "refuse" ? { decision, reasons, note: note.trim() || null, sendReasons: send } : { decision },
    });
    setBusy(null);
    if (!res.ok) return setMessage({ kind: "error", text: res.error.message });
    const verb = { accept: "retenu", waitlist: "mis en liste d'attente", refuse: "refusé" }[decision];
    setMessage({ kind: "ok", text: `${item.provider?.name ?? "Prestataire"} : ${verb}.` });
    setRefusing(null);
    setReasons([]);
    setNote("");
    onChanged();
  }

  async function accredit(item: ApplicationForTriage, accredited: boolean) {
    if (busy) return;
    setBusy(item.id);
    setMessage(null);
    const res = await apiFetch(`/events/${eventId}/applications/${item.id}/accreditation`, {
      method: "PATCH",
      json: { accredited },
    });
    setBusy(null);
    if (!res.ok) return setMessage({ kind: "error", text: res.error.message });
    setMessage({
      kind: "ok",
      text: `${item.provider?.name ?? "Prestataire"} : ${accredited ? "accrédité « Média officiel »" : "accréditation retirée"}.`,
    });
    onChanged();
  }

  const toggleReason = (r: RefusalReason) =>
    setReasons((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));

  return (
    <div className="s-stack" data-testid="provider-triage">
      <ChipRow className="s-chips-wrap">
        {FILTERS.map((f) => (
          <Chip
            key={f.id}
            selected={status === f.id}
            variant={status === f.id ? "accent" : "default"}
            onClick={() => setStatus(f.id)}
          >
            {f.label} · {count(f.id)}
          </Chip>
        ))}
      </ChipRow>
      <p className="o-t-caption s-muted">
        Les prestataires ne comptent jamais dans les places : leur liste d'attente est manuelle, sans offre automatique.
      </p>
      {message && (
        <p
          className={message.kind === "error" ? "s-error" : "s-notice s-notice--ok"}
          role="status"
          data-testid="provider-message"
        >
          {message.text}
        </p>
      )}
      {shown.length === 0 && (
        <div className="orga__panel" data-testid="provider-empty">
          <p className="s-lead">Aucun prestataire dans cette liste.</p>
        </div>
      )}
      {shown.map((item) => {
        const p = item.provider;
        const badge = badgeFor(item);
        const type = (p?.type ?? "other") as VendorTypeCode;
        const photo = p?.photos[0];
        const insta = instagramHandle(p?.instagram);
        return (
          <article
            key={item.id}
            className="orga__panel prov__card"
            data-testid="provider-card"
            data-application={item.id}
          >
            <div className="prov__photo">
              {photo ? (
                <img src={photo.url} alt={p?.name ?? "Prestataire"} />
              ) : (
                <span className="s-muted">Pas de photo</span>
              )}
            </div>
            <div className="tri__col">
              <div className="s-row s-row--between">
                <h2 className="s-title o-never-truncate" data-testid="provider-name">
                  {p?.name ?? "Profil supprimé"}
                </h2>
                {badge && <StatusBadge status={badge.status} rank={badge.rank} />}
              </div>
              <ChipRow>
                <Chip>{p?.typeLabel ?? "—"}</Chip>
                {item.accreditedMedia && <Chip variant="accent">Média officiel</Chip>}
              </ChipRow>
              {p?.description && <p className="s-muted">{p.description}</p>}
              {item.message && <p>« {item.message} »</p>}
              <div className="tri__kv">
                <span>Candidat</span>
                <span>
                  {item.applicant.pseudo} · {item.applicant.eventsCount} événement
                  {item.applicant.eventsCount > 1 ? "s" : ""}
                </span>
              </div>
              <div className="tri__kv">
                <span>Liens</span>
                <span className="s-row">
                  {insta && p?.instagram && (
                    <a href={p.instagram} target="_blank" rel="noopener noreferrer">
                      {insta}
                    </a>
                  )}
                  {p?.portfolioUrl && (
                    <a href={p.portfolioUrl} target="_blank" rel="noopener noreferrer">
                      Portfolio
                    </a>
                  )}
                  {p?.website && (
                    <a href={p.website} target="_blank" rel="noopener noreferrer">
                      Site
                    </a>
                  )}
                  {!insta && !p?.portfolioUrl && !p?.website && "—"}
                </span>
              </div>
              <div className="tri__kv">
                <span>Contact</span>
                <span data-testid="provider-contact">
                  {[p?.phone, p?.email].filter(Boolean).join(" · ") || (item.applicant.email ?? "—")}
                </span>
              </div>
              <div className="tri__kv">
                <span>Candidature</span>
                <span>{formatDateTime(item.createdAt)}</span>
              </div>
              {structureId && (
                <details className="tri__kv" data-testid="provider-notes" open={item.applicant.notes.length > 0}>
                  <summary>
                    {afterEventLabels.notesTitle} · {item.applicant.notes.length}
                  </summary>
                  <StructureNotes
                    structureId={structureId}
                    pseudo={item.applicant.pseudo}
                    eventId={eventId}
                    initial={item.applicant.notes}
                  />
                </details>
              )}

              {refusing === item.id ? (
                <div className="s-stack s-stack--tight" data-testid="refusal-panel">
                  <div className="s-label o-t-label">Si refus · motifs envoyés au candidat (décochable)</div>
                  <div className="tri__reasons">
                    {refusalReasons.map((reason, i) => (
                      <CheckboxField
                        key={reason}
                        checked={reasons.includes(reason)}
                        onChange={() => toggleReason(reason)}
                        label={`${i + 1} · ${refusalReasonLabels[reason]}`}
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
                    label="Envoyer les motifs au candidat"
                  />
                  <div className="tri__actions">
                    <Button
                      variant="secondary"
                      icon="check"
                      loading={busy === item.id}
                      onClick={() => void decide(item, "refuse")}
                    >
                      Confirmer le refus
                    </Button>
                    <Button variant="secondary" icon="close" onClick={() => setRefusing(null)}>
                      Annuler
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="tri__actions">
                  {item.status !== "refused" && (
                    <Button
                      variant="secondary"
                      icon="close"
                      disabled={!canDecide || busy !== null}
                      onClick={() => {
                        setRefusing(item.id);
                        setReasons([]);
                        setNote("");
                      }}
                    >
                      Refuser
                    </Button>
                  )}
                  {item.status === "pending" && (
                    <Button
                      variant="secondary"
                      icon="wait"
                      disabled={!canDecide || busy !== null}
                      onClick={() => void decide(item, "waitlist")}
                    >
                      Liste d'attente
                    </Button>
                  )}
                  {item.status !== "accepted" && (
                    <Button
                      variant="secondary"
                      icon="check"
                      disabled={!canDecide || busy !== null}
                      onClick={() => void decide(item, "accept")}
                    >
                      Retenir
                    </Button>
                  )}
                  {canAccreditMedia && canAccredit({ type }, item.status) && (
                    <Button
                      variant="secondary"
                      icon="profile"
                      disabled={busy !== null}
                      onClick={() => void accredit(item, !item.accreditedMedia)}
                    >
                      {item.accreditedMedia ? "Retirer « Média officiel »" : "Média officiel"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
