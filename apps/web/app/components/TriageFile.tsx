import { Button, CheckboxField, Chip, ChipRow } from "@orasso/design-system/web";
import {
  type ApplicationForTriage,
  afterEventLabels,
  applicationStatusLabels,
  crewLabels,
  eventDaysLabels,
  formatDayDate,
  type Page,
  type RefusalReason,
  refusalReasonLabels,
  refusalReasons,
  type TriageDecision,
} from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "../lib/api.client";
import { formatDateTime } from "../lib/format";
import { StructureNotes } from "./StructureNotes";

type Decided = { item: ApplicationForTriage; decision: TriageDecision };

const DECISION_LABEL: Record<TriageDecision, string> = {
  accept: "Retenue",
  waitlist: "Mise en liste d'attente",
  refuse: "Refusée",
};

/**
 * File de tri au clavier (une candidature à la fois, grandes photos). V retient, A met en liste d'attente, R refuse
 * (motifs à cocher, envoyés au candidat sauf décision contraire), Espace passe sans décider, Z revient à la dernière.
 * Chaque décision part tout de suite ; la suivante est déjà chargée.
 */
export function TriageFile({
  eventId,
  structureId,
  notesWritable = true,
  initial,
  canDecide,
  onDecided,
}: {
  eventId: string;
  /** Notes internes de la structure (lot 27) : affichées pour les organisateurs seulement. */
  structureId?: string;
  notesWritable?: boolean;
  initial: ApplicationForTriage[];
  canDecide: boolean;
  onDecided?: () => void;
}) {
  const [queue, setQueue] = useState<ApplicationForTriage[]>(initial);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [history, setHistory] = useState<Decided[]>([]);
  const [review, setReview] = useState<Decided | null>(null);
  const [photo, setPhoto] = useState(0);
  const [refusing, setRefusing] = useState(false);
  const [reasons, setReasons] = useState<RefusalReason[]>([]);
  const [note, setNote] = useState("");
  const [sendReasons, setSendReasons] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const current = review?.item ?? queue.find((q) => !skipped.includes(q.id)) ?? null;

  // File vide : on va chercher les nouvelles candidatures (celles passées reviennent en tête).
  const reload = useCallback(async () => {
    const res = await apiFetch<Page<ApplicationForTriage>>(
      `/events/${eventId}/applications?status=pending&sort=created_at&limit=50`,
    );
    if (res.ok) {
      setQueue(res.data.items);
      setSkipped([]);
    }
  }, [eventId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: la photo revient à la première à chaque candidature
  useEffect(() => {
    setPhoto(0);
  }, [current?.id]);

  useEffect(() => {
    if (!current && !review) void reload();
  }, [current, review, reload]);

  async function decide(decision: TriageDecision, extra?: { reasons: RefusalReason[]; note: string; send: boolean }) {
    if (!current || busy || !canDecide) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    setBusy(true);
    setMessage(null);
    const res = await apiFetch(`/events/${eventId}/applications/${current.id}/decide`, {
      method: "POST",
      json: {
        decision,
        ...(decision === "refuse"
          ? { reasons: extra?.reasons, note: extra?.note || null, sendReasons: extra?.send ?? true }
          : {}),
      },
    });
    setBusy(false);
    if (!res.ok) {
      setMessage({ kind: "error", text: res.error.message });
      return;
    }
    const decided = { item: current, decision };
    setHistory((h) => [...h, decided]);
    setQueue((q) => q.filter((x) => x.id !== current.id));
    setReview(null);
    setRefusing(false);
    setReasons([]);
    setNote("");
    setMessage({ kind: "ok", text: `${current.applicant.pseudo} : ${DECISION_LABEL[decision].toLowerCase()}.` });
    onDecided?.();
  }

  function skip() {
    if (!current || review) return;
    setSkipped((s) => [...s, current.id]);
  }

  function back() {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setReview(last);
    setRefusing(false);
    setMessage({
      kind: "ok",
      text: `Retour sur ${last.item.applicant.pseudo} (${DECISION_LABEL[last.decision].toLowerCase()}) : une nouvelle décision remplace la précédente.`,
    });
  }

  function confirmRefusal() {
    if (reasons.length === 0) return setMessage({ kind: "error", text: "Choisis au moins un motif." });
    if (reasons.includes("other") && !note.trim()) {
      return setMessage({ kind: "error", text: "Motif « Autre » : ajoute une note." });
    }
    void decide("refuse", { reasons, note: note.trim(), send: sendReasons });
  }

  // Touches : jamais pendant la saisie dans un champ.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) {
        if (e.key === "Escape") (target as HTMLElement).blur();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (refusing) {
        if (key === "escape") setRefusing(false);
        else if (key === "enter") {
          e.preventDefault();
          confirmRefusal();
        } else if (/^[1-7]$/.test(key)) {
          const reason = refusalReasons[Number(key) - 1];
          if (reason) toggleReason(reason);
        }
        return;
      }
      if (key === "v") void decide("accept");
      else if (key === "a") void decide("waitlist");
      else if (key === "r") {
        if (current && canDecide) setRefusing(true);
      } else if (key === " ") {
        e.preventDefault();
        skip();
      } else if (key === "z") back();
      else if (key === "arrowright") setPhoto((p) => Math.min(p + 1, (current?.vehicle?.photos.length ?? 1) - 1));
      else if (key === "arrowleft") setPhoto((p) => Math.max(p - 1, 0));
    };
    // Espace passe la candidature : il ne doit pas aussi « cliquer » le bouton resté sélectionné après un clic.
    const onKeyUp = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.key === " " && target?.tagName === "BUTTON") e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  });

  function toggleReason(reason: RefusalReason) {
    setReasons((cur) => (cur.includes(reason) ? cur.filter((r) => r !== reason) : [...cur, reason]));
  }

  if (!current) {
    return (
      <div className="orga__panel" data-testid="triage-empty">
        <p className="s-lead">
          Plus aucune candidature à trier.
          {skipped.length > 0 ? " Celles que tu as passées reviennent en tête." : ""}
        </p>
        {message && (
          <p
            className={message.kind === "error" ? "s-error" : "s-notice s-notice--ok"}
            role="status"
            data-testid="triage-message"
          >
            {message.text}
          </p>
        )}
      </div>
    );
  }

  const v = current.vehicle;
  const photos = v?.photos ?? [];
  const shown = photos[photo];
  const specs = [v?.year, v?.powerHp ? `${v.powerHp} ch` : null, v?.weightKg ? `${v.weightKg} kg` : null, v?.country]
    .filter(Boolean)
    .join(" · ");
  const opinions = current.filteringOpinions;

  return (
    <div className="orga__panel" data-testid="triage-card" data-application={current.id}>
      <div className="tri__media">
        <div className="tri__photo">
          {shown ? <img src={shown.url} alt={v?.label ?? "Véhicule"} /> : <span className="s-muted">Pas de photo</span>}
          {v?.certified && (
            <span className="tri__photo-tag">
              <Chip variant="accent">Certifié</Chip>
            </span>
          )}
          {photos.length > 0 && (
            <span className="tri__photo-count o-t-credit">
              {photo + 1} / {photos.length} · ← → photos
            </span>
          )}
        </div>
        {photos.length > 1 && (
          <div className="tri__thumbs">
            {photos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                className={i === photo ? "is-on" : undefined}
                onClick={() => setPhoto(i)}
                aria-label={`Photo ${i + 1}`}
              >
                <img src={p.url} alt="" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="tri__col">
        <div className="s-row s-row--between">
          <h2 className="s-title o-never-truncate" data-testid="triage-vehicle">
            {v?.label ?? "Véhicule supprimé"}
          </h2>
          <div className="o-t-meta s-muted">{specs}</div>
        </div>
        <ChipRow>
          {(v?.categories ?? []).map((c) => (
            <Chip key={c.id}>{c.label}</Chip>
          ))}
        </ChipRow>
        {v?.description && <p className="s-muted">{v.description}</p>}

        <div className="tri__kv">
          <span>Candidat</span>
          <span data-testid="triage-pseudo">
            {current.applicant.pseudo} · {current.applicant.eventsCount} événement
            {current.applicant.eventsCount > 1 ? "s" : ""} · {current.applicant.absencesCount} absence
            {current.applicant.absencesCount > 1 ? "s" : ""}
          </span>
        </div>
        {current.day && (
          <div className="tri__kv" data-testid="triage-day">
            <span>{eventDaysLabels.day}</span>
            <span>{formatDayDate(current.day.date)}</span>
          </div>
        )}
        <div className="tri__kv">
          <span>Avec nous</span>
          <span>
            {current.applicant.historyWithStructure.total === 0
              ? "Première candidature"
              : `Retenu ${current.applicant.historyWithStructure.accepted} fois · refusé ${current.applicant.historyWithStructure.refused}`}
          </span>
        </div>
        {structureId && (
          <details className="tri__kv" data-testid="triage-notes" open={current.applicant.notes.length > 0}>
            <summary>
              {afterEventLabels.notesTitle} · {current.applicant.notes.length}
            </summary>
            <StructureNotes
              key={current.id}
              structureId={structureId}
              pseudo={current.applicant.pseudo}
              eventId={eventId}
              initial={current.applicant.notes}
              writable={notesWritable}
            />
          </details>
        )}
        {current.crew && (
          <div className="tri__kv" data-testid="triage-crew">
            <span>{crewLabels.triageCrew}</span>
            <span>
              {current.crew.archived ? (
                <span className="o-never-truncate">{current.crew.name}</span>
              ) : (
                <a href={`/c/${current.crew.slug}`} className="o-never-truncate">
                  {current.crew.name}
                </a>
              )}{" "}
              · {crewLabels.confirmedCount(current.crew.confirmed, current.crew.total)}
              {current.crew.members.filter((m) => m.applicationId !== current.id).length > 0 && (
                <>
                  {" "}
                  · {crewLabels.triageCrewOthers.toLowerCase()} :{" "}
                  {current.crew.members
                    .filter((m) => m.applicationId !== current.id)
                    .map((m) => `${m.pseudo} (${applicationStatusLabels[m.status].toLowerCase()})`)
                    .join(", ")}
                </>
              )}
            </span>
          </div>
        )}
        {opinions.length > 0 && (
          <div className="tri__kv">
            <span>Filtration</span>
            <span>{opinions.map((o) => `« ${o.opinion} » ${o.pseudo}`).join(", ")}</span>
          </div>
        )}
        <div className="tri__kv">
          <span>Plaque</span>
          <span>{v?.unregistered ? "Non immatriculé" : (v?.plate ?? "—")}</span>
        </div>
        <div className="tri__kv">
          <span>Alertes</span>
          <span>
            {current.alerts.length === 0
              ? "Aucune"
              : current.alerts
                  .map((a) =>
                    a === "duplicatePlate" ? "Plaque en double" : a === "banned" ? "Banni" : "Non immatriculé",
                  )
                  .join(", ")}
          </span>
        </div>
        <div className="tri__kv">
          <span>Candidature</span>
          <span>{formatDateTime(current.createdAt)}</span>
        </div>

        {review && (
          <p className="s-notice">
            Décision précédente : {DECISION_LABEL[review.decision].toLowerCase()}. Choisis la nouvelle décision.
          </p>
        )}

        {refusing ? (
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
              ref={noteRef}
              className="s-textarea o-t-body"
              rows={2}
              placeholder="Note (obligatoire pour « Autre »)"
              value={note}
              onChange={(e) => setNote(e.currentTarget.value)}
              aria-label="Note"
            />
            <CheckboxField
              checked={sendReasons}
              onChange={(e) => setSendReasons(e.currentTarget.checked)}
              label="Envoyer les motifs au candidat"
            />
            <div className="tri__actions">
              <Button variant="primary" icon="check" shortcut="↵" loading={busy} onClick={confirmRefusal}>
                Confirmer le refus
              </Button>
              <Button variant="secondary" icon="close" shortcut="Échap" onClick={() => setRefusing(false)}>
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <div className="tri__actions">
            <Button
              variant="secondary"
              icon="close"
              shortcut="R"
              disabled={!canDecide || busy}
              onClick={() => setRefusing(true)}
            >
              Refuser
            </Button>
            <Button
              variant="secondary"
              icon="wait"
              shortcut="A"
              disabled={!canDecide || busy}
              onClick={() => void decide("waitlist")}
            >
              Liste d'attente
            </Button>
            <Button
              variant="primary"
              icon="check"
              shortcut="V"
              disabled={!canDecide || busy}
              onClick={() => void decide("accept")}
            >
              Retenir
            </Button>
            <Button variant="secondary" icon="undo" shortcut="Z" disabled={history.length === 0 || busy} onClick={back}>
              Annuler
            </Button>
          </div>
        )}
        {message && (
          <p
            className={message.kind === "error" ? "s-error" : "s-notice s-notice--ok"}
            role="status"
            data-testid="triage-message"
          >
            {message.text}
          </p>
        )}
        <p className="o-t-caption s-kbd-hint">
          Décision envoyée immédiatement au candidat. Suivant chargé sans clic. Espace passe sans décider.
          {!canDecide && " Tu peux donner ton avis, la décision revient à l'organisateur."}
        </p>
      </div>
    </div>
  );
}
