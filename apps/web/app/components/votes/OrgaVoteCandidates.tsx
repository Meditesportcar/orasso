// Les candidats d'un vote « à la main » (lot R7l2, maquette R7.16 `vl_rup`), côté site : la liste (une voiture pas encore
// entrée est marquée « pas encore entrée »), « Retirer », et « Ajouter » par la recherche d'un pseudo ou d'un modèle parmi
// les retenues. Pas de scan du QR sur le site (appareil photo : appli seulement). Les candidats ne changent plus une fois le
// vote ouvert : l'API refuse (409 `vote_locked`), l'écran masque alors la recherche et les boutons.
import { Button, TextField } from "@orasso/design-system/web";
import { type ApplicationForTriage, voteOrgaLabels as L, type Page, type VoteManageItem } from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api.client";

export function OrgaVoteCandidates({
  eventId,
  vote,
  editable,
  enteredIds,
  onChanged,
}: {
  eventId: string;
  vote: VoteManageItem;
  /** Vote encore « prévu » et droit d'écrire. */
  editable: boolean;
  /** Candidatures dont la voiture est entrée (`VoteManage.enteredApplicationIds`). */
  enteredIds: ReadonlySet<string>;
  onChanged: () => Promise<void> | void;
}) {
  const candidates = vote.handCandidates ?? [];
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ApplicationForTriage[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  // Deux lettres au moins ; la réponse d'une saisie passée est ignorée.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits(null);
      setSearchError(null);
      return;
    }
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      const res = await apiFetch<Page<ApplicationForTriage>>(
        `/events/${eventId}/applications?kind=vehicle&status=accepted&sort=pseudo&limit=12&q=${encodeURIComponent(q)}`,
      );
      if (mine !== seq.current) return;
      if (res.ok) {
        setHits(res.data.items);
        setSearchError(null);
      } else {
        setHits(null);
        setSearchError(L.searchError);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, eventId]);

  async function run(key: string, call: () => ReturnType<typeof apiFetch>) {
    setBusy(key);
    setError(null);
    const res = await call();
    setBusy(null);
    if (!res.ok) return setError(res.error.message);
    await onChanged();
  }

  const taken = new Set(candidates.map((x) => x.applicationId));
  const results = (hits ?? []).filter((h) => !taken.has(h.id));

  return (
    <div className="s-stack s-stack--tight ov-candidates" data-testid="vote-candidates-panel">
      <p className="o-t-caption s-muted" data-testid="vote-candidates-count">
        {L.candidatesCount(candidates.filter((x) => x.entered).length, candidates.length)}
      </p>
      {error ? (
        <p className="s-error" role="alert">
          {error}
        </p>
      ) : null}
      {candidates.length === 0 ? <p className="s-muted">{L.candidatesNone}</p> : null}
      <ul className="ov-rows" data-testid="vote-candidates">
        {candidates.map((x) => (
          <li key={x.applicationId} data-testid={`vote-candidate-${x.applicationId}`}>
            <span className="ov-card__text">
              <b className="o-never-truncate">{x.vehicleLabel}</b>
              <small className="s-muted">{`${x.pseudo} · ${x.entered ? L.entered : L.notEntered}`}</small>
            </span>
            {editable ? (
              <Button
                variant="secondary"
                icon="close"
                disabled={busy !== null}
                onClick={() =>
                  void run(`rm-${x.applicationId}`, () =>
                    apiFetch(`/events/${eventId}/votes/${vote.id}/candidates/${x.applicationId}`, {
                      method: "DELETE",
                    }),
                  )
                }
                data-testid={`vote-candidate-remove-${x.applicationId}`}
              >
                {L.removeCandidate}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      {editable ? (
        <>
          <TextField
            label={L.searchField}
            name={`voteSearch-${vote.id}`}
            value={query}
            autoComplete="off"
            onChange={(e) => setQuery(e.currentTarget.value)}
            data-testid="vote-search"
          />
          {query.trim().length > 0 && query.trim().length < 2 ? (
            <p className="o-t-caption s-muted">{L.searchShort}</p>
          ) : null}
          {searchError ? (
            <p className="s-error" role="alert">
              {searchError}
            </p>
          ) : null}
          {hits && results.length === 0 && !searchError ? <p className="s-muted">{L.searchNone}</p> : null}
          <ul className="ov-rows">
            {results.map((h) => (
              <li key={h.id} data-testid={`vote-hit-${h.id}`}>
                <span className="ov-card__text">
                  <b className="o-never-truncate">{h.vehicle?.label ?? "Voiture"}</b>
                  <small className="s-muted">{`${h.applicant.pseudo} · ${enteredIds.has(h.id) ? L.retained : L.retainedNotEntered}`}</small>
                </span>
                <Button
                  variant="secondary"
                  icon="add"
                  disabled={busy !== null}
                  onClick={() =>
                    void run(`add-${h.id}`, () =>
                      apiFetch(`/events/${eventId}/votes/${vote.id}/candidates`, {
                        method: "POST",
                        json: { applicationId: h.id },
                      }),
                    )
                  }
                  data-testid={`vote-hit-add-${h.id}`}
                >
                  {L.addCandidate}
                </Button>
              </li>
            ))}
          </ul>
          <p className="o-t-caption s-muted">{L.scanSiteNote}</p>
        </>
      ) : (
        <p className="o-t-caption s-muted">{L.lockedCandidates}</p>
      )}
    </div>
  );
}
