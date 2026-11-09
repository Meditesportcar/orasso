// Les votes d'un événement vus par l'équipe (lot R7l2, site) : la console (`GET /events/:id/votes/manage`), relue à chaque
// message du canal `event:{id}:votes` et toutes les minutes au cas où le canal se coupe. L'heure vient de l'horloge
// d'Orasso (jamais de celle de la machine seule).
import type { VoteManage } from "@orasso/shared";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../lib/api.client";
import { now as clockNow } from "../../lib/clock";
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

  const reload = useCallback(async () => {
    if (!eventId) return;
    const res = await apiFetch<VoteManage>(`/events/${eventId}/votes/manage`);
    if (res.ok) {
      setManage(res.data);
      setError(null);
    } else setError(res.error.message);
    setLoading(false);
  }, [eventId]);

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

  return { manage, error, loading, reload, now, refreshNow: () => setNow(clockNow()) };
}
