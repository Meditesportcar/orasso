// Les votes d'un événement vus par l'équipe (lot R7l2, site) : la console (`GET /events/:id/votes/manage`), relue à chaque
// message du canal `event:{id}:votes` et toutes les minutes au cas où le canal se coupe. L'heure vient de l'horloge
// d'Orasso (jamais de celle de la machine seule).
import { createCoalescedRun, type VoteManage, voteStaleMinutes } from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api.client";
import { now as clockNow, nowMs } from "../../lib/clock";
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

  // Relectures regroupées : une en cours, au plus une en attente, relancée à la fin de la précédente. Les réponses
  // arrivent donc dans l'ordre et chacune s'applique : un message du canal par seconde et une lecture de 2 s ne
  // laissent plus l'écran figé. Une lecture lancée après une clôture lit l'état d'après la clôture.
  const eventRef = useRef(eventId);
  eventRef.current = eventId;
  const reload = useRef(
    createCoalescedRun(async () => {
      const id = eventRef.current;
      if (!id) return;
      const res = await apiFetch<VoteManage>(`/events/${id}/votes/manage`);
      if (eventRef.current !== id) return; // l'écran a changé d'événement pendant la lecture
      if (res.ok) {
        setManage(res.data);
        setLoadedAt(nowMs());
        setError(null);
      } else setError(res.error.message);
      setLoading(false);
    }),
  ).current;

  // biome-ignore lint/correctness/useExhaustiveDependencies: un autre événement relance la lecture.
  useEffect(() => {
    void reload();
    const timer = setInterval(() => {
      void reload();
      setNow(clockNow());
    }, 60_000);
    return () => clearInterval(timer);
  }, [reload, eventId]);

  useChannel(eventId ? `event:${eventId}:votes` : null, (m) => {
    if (VOTE_MESSAGES.has(m.type)) void reload();
  });

  // Une erreur avec des données gardées : leur âge, à dire à côté de l'erreur (`null` : rien de périmé à signaler).
  const staleMinutes = error && manage && loadedAt !== null ? voteStaleMinutes(loadedAt, now.getTime()) : null;
  return { manage, error, loading, reload, now, staleMinutes, refreshNow: () => setNow(clockNow()) };
}
