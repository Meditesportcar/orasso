// Les candidats d'un vote « à la main » (lot R7l2, maquette R7.16 `vl_rup`), côté site : la liste (une voiture pas encore
// entrée est marquée « pas encore entrée »), « Retirer », et « Ajouter » par la recherche d'un pseudo ou d'un modèle parmi
// les retenues. Pas de scan du QR sur le site (appareil photo : appli seulement). Les candidats ne changent plus une fois le
// vote ouvert : l'API refuse (409 `vote_locked`), l'écran masque alors la recherche et les boutons.
import { Button, TextField } from "@orasso/design-system/web";
import {
  type ApplicationForTriage,
  voteOrgaLabels as L,
  type Page,
  type VoteManageItem,
  voteSearchView,
} from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api.client";
import { createLatestGate } from "../../lib/latestRequest";

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
  const [next, setNext] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const gate = useRef(createLatestGate()).current;

  // Une page de résultats (12 voitures) ; la suite s'ajoute à la fin. Une réponse d'une saisie passée, ou d'un champ vidé,
  // est jetée (la porte avance à chaque changement du champ et au nettoyage de l'effet).
  async function loadPage(q: string, cursor: string | null) {
    const ticket = gate.start();
    setSearching(true);
    const res = await apiFetch<Page<ApplicationForTriage>>(
      `/events/${eventId}/applications?kind=vehicle&status=accepted&sort=pseudo&limit=12&q=${encodeURIComponent(q)}${
        cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
      }`,
    );
    if (!ticket.latest()) return;
    setSearching(false);
    if (res.ok) {
      setHits((old) => (cursor ? [...(old ?? []), ...res.data.items] : res.data.items));
      setNext(res.data.nextCursor);
      setSearchError(null);
    } else {
      setHits(null);
      setNext(null);
      setSearchError(L.searchError);
    }
  }

  // Deux lettres au moins.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `loadPage` ne lit que `eventId` et la porte, stables ici.
  useEffect(() => {
    gate.invalidate();
    const q = query.trim();
    // Dès que le champ change : les résultats et le curseur de la saisie d'avant sont vidés (jamais mélangés avec la
    // suivante), « Voir plus » reste éteint jusqu'à la réponse de la nouvelle recherche.
    setHits(null);
    setNext(null);
    setSearchError(null);
    setSearching(q.length >= 2);
    if (q.length < 2) return;
    const timer = setTimeout(() => void loadPage(q, null), 300);
    return () => {
      clearTimeout(timer);
      gate.invalidate();
    };
  }, [query, eventId, gate]);

  async function run(key: string, call: () => ReturnType<typeof apiFetch>) {
    setBusy(key);
    setError(null);
    const res = await call();
    setBusy(null);
    if (!res.ok) return setError(res.error.message);
    await onChanged();
  }

  const taken = new Set(candidates.map((x) => x.applicationId));
  const { results, needMore, showNone, canMore } = voteSearchView({ items: hits, next, loading: searching }, taken);

  // Toutes les voitures de la page sont déjà candidates : la page suivante se charge d'elle-même.
  // biome-ignore lint/correctness/useExhaustiveDependencies: déclenché par l'état de la recherche seulement.
  useEffect(() => {
    if (needMore && next) void loadPage(query.trim(), next);
  }, [needMore, next]);

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
          {showNone && !searchError ? <p className="s-muted">{L.searchNone}</p> : null}
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
          {canMore ? (
            <Button
              variant="secondary"
              icon="add"
              disabled={searching}
              onClick={() => void loadPage(query.trim(), next)}
              data-testid="vote-search-more"
            >
              {L.searchMore}
            </Button>
          ) : null}
          <p className="o-t-caption s-muted">{L.scanSiteNote}</p>
        </>
      ) : (
        <p className="o-t-caption s-muted">{L.lockedCandidates}</p>
      )}
    </div>
  );
}
