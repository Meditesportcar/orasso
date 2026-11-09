// Les votes d'un événement vus par l'équipe (lot R7l2, site) : la console (`GET /events/:id/votes/manage`), relue à chaque
// message du canal `event:{id}:votes` et toutes les minutes au cas où le canal se coupe. L'heure vient de l'horloge
// d'Orasso (jamais de celle de la machine seule).
import { type VoteManage, voteStaleMinutes } from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api.client";
import { now as clockNow, nowMs } from "../../lib/clock";
import { createLatestGate } from "../../lib/latestRequest";
import { useChannel } from "../../lib/useChannel";

/** Les messages du canal qui changent ce que l'écran montre (R7l1 : `votes.changed`, `theme_votes.changed`…). */
const VOTE_MESSAGES = new Set([
  "votes.changed",
  "theme_votes.changed",
  "votes.opened",
  "votes.closed",
  "votes.candidates.changed",
]);

export function useOrgaVotes(eventId: string | null, initial: VoteManage | null = null) {
  const [manage, setManage] = useState<VoteManage | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(eventId) && initial === null);
  const [now, setNow] = useState(() => clockNow());
  // Dernière lecture réussie (ms de l'horloge d'Orasso) : l'âge des données gardées après une coupure.
  const [loadedAt, setLoadedAt] = useState<number | null>(() => (initial ? nowMs() : null));
  const gate = useRef(createLatestGate()).current;

  const reload = useCallback(async () => {
    if (!eventId) return;
    // Seule la dernière lecture compte : une réponse d'avant une clôture, arrivée après, ne la défait pas.
    const ticket = gate.start();
    const res = await apiFetch<VoteManage>(`/events/${eventId}/votes/manage`);
    if (!ticket.latest()) return;
    if (res.ok) {
      setManage(res.data);
      setLoadedAt(nowMs());
      setError(null);
    } else setError(res.error.message);
    setLoading(false);
  }, [eventId, gate]);

  useEffect(() => {
    void reload();
    const timer = setInterval(() => {
      void reload();
      setNow(clockNow());
    }, 60_000);
    return () => clearInterval(timer);
  }, [reload]);

  useChannel(eventId ? `event:${eventId}:votes` : null, (m) => {
    if (VOTE_MESSAGES.has(m.type)) void reload();
  });

  // Une erreur avec des données gardées : leur âge, à dire à côté de l'erreur (`null` : rien de périmé à signaler).
  const staleMinutes = error && manage && loadedAt !== null ? voteStaleMinutes(loadedAt, now.getTime()) : null;
  return { manage, error, loading, reload, now, staleMinutes, refreshNow: () => setNow(clockNow()) };
}
