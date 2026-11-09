// Les données de l'écran « Votes » (lot R7l2) : la console de l'équipe (`GET /events/:id/votes/manage`), l'événement (zones,
// publication, dates) et les marques (noms des marques d'un vote « une origine ou des marques »). Rechargées à chaque
// message du canal `event:{id}:votes` tant que l'écran est affiché, et toutes les minutes au cas où le canal se coupe.
import { createCoalescedRun, type EventOrganizer, type VoteManage, type VoteManageItem } from "@orasso/shared";
import { useIsFocused } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "@/lib/api";
import { useChannel } from "@/lib/realtime";
import { useApi } from "@/lib/useApi";
import { readStamp, staleSince } from "./votesFreshness";

/** Les messages du canal qui changent ce que l'écran montre (voir `VotesChangedMessage` et R7l1, tour 2). */
const VOTE_MESSAGES = new Set([
  "votes.changed",
  "theme_votes.changed",
  "votes.opened",
  "votes.closed",
  "votes.candidates.changed",
]);

export function useVotesData(
  eventId: string,
  { organizer, enabled = true }: { organizer: boolean; enabled?: boolean },
) {
  const focused = useIsFocused();
  const manage = useApi<VoteManage>(() => api.voteManage(eventId), [eventId], { enabled, refreshMs: 60_000 });
  // Dernière lecture réussie : après une coupure, `useApi` garde les données ; leur âge est dit à côté de l'erreur.
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  useEffect(() => {
    if (manage.data) setLoadedAt(readStamp());
  }, [manage.data]);
  // Le minuteur fait recalculer l'âge (la comparaison se fait sur l'horloge d'Orasso, comme la lecture).
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  const staleMinutes = staleSince(loadedAt, Boolean(manage.error), Boolean(manage.data));
  // Relectures regroupées : une en cours, au plus une en attente. Un message du canal par seconde ne ferait sinon que
  // relancer la lecture avant sa réponse (qui serait jetée par `useApi`) : l'écran ne se mettrait jamais à jour en 4G.
  const reloadRef = useRef(manage.reload);
  reloadRef.current = manage.reload;
  const coalesced = useRef(createCoalescedRun(() => reloadRef.current())).current;
  // L'équipe seulement lit l'événement complet : le staff n'en a pas besoin (lecture seule, aucune action).
  const event = useApi<EventOrganizer>(() => api.orgEvent(eventId), [eventId], { enabled: organizer && enabled });
  const needsMakes = (manage.data?.items ?? []).some((v) => (v.candidateFilter?.makeIds?.length ?? 0) > 0);
  const makes = useApi(() => api.makes(), [], { enabled: needsMakes });
  useChannel(focused && enabled ? `event:${eventId}:votes` : null, (message) => {
    if (VOTE_MESSAGES.has(message.type)) void coalesced();
  });
  const zoneName = useMemo(() => {
    const zones = event.data?.zones ?? [];
    return (id: string) => zones.find((z) => z.id === id)?.name ?? null;
  }, [event.data]);
  const makeNames = useMemo(() => {
    const list = makes.data ?? [];
    return (ids: string[]) => ids.map((id) => list.find((m) => m.id === id)?.name).filter((n): n is string => !!n);
  }, [makes.data]);
  // `manage.reload` rendu aux écrans est le regroupé : actions, tirer pour actualiser, « Réessayer ».
  const managed = useMemo(() => ({ ...manage, reload: coalesced }), [manage, coalesced]);
  return { manage: managed, event, makes, zoneName, makeNames, staleMinutes };
}

/** L'icône d'une ligne de vote : le trophée pour « Toutes catégories », sinon selon les candidats. */
export function voteIcon(v: Pick<VoteManageItem, "kind" | "candidateMode">) {
  if (v.kind === "all_categories") return "trophy" as const;
  return v.candidateMode === "hand"
    ? ("qr" as const)
    : v.candidateMode === "zone"
      ? ("place" as const)
      : ("flag" as const);
}
