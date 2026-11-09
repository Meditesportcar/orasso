// Les données de l'écran « Votes » (lot R7l2) : la console de l'équipe (`GET /events/:id/votes/manage`), l'événement (zones,
// publication, dates) et les marques (noms des marques d'un vote « une origine ou des marques »). Rechargées à chaque
// message du canal `event:{id}:votes` tant que l'écran est affiché, et toutes les minutes au cas où le canal se coupe.
import type { EventOrganizer, VoteManage, VoteManageItem } from "@orasso/shared";
import { useIsFocused } from "expo-router";
import { useMemo } from "react";

import { api } from "@/lib/api";
import { useChannel } from "@/lib/realtime";
import { useApi } from "@/lib/useApi";

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
  // L'équipe seulement lit l'événement complet : le staff n'en a pas besoin (lecture seule, aucune action).
  const event = useApi<EventOrganizer>(() => api.orgEvent(eventId), [eventId], { enabled: organizer && enabled });
  const needsMakes = (manage.data?.items ?? []).some((v) => (v.candidateFilter?.makeIds?.length ?? 0) > 0);
  const makes = useApi(() => api.makes(), [], { enabled: needsMakes });
  useChannel(focused && enabled ? `event:${eventId}:votes` : null, (message) => {
    if (VOTE_MESSAGES.has(message.type)) void manage.reload();
  });
  const zoneName = useMemo(() => {
    const zones = event.data?.zones ?? [];
    return (id: string) => zones.find((z) => z.id === id)?.name ?? null;
  }, [event.data]);
  const makeNames = useMemo(() => {
    const list = makes.data ?? [];
    return (ids: string[]) => ids.map((id) => list.find((m) => m.id === id)?.name).filter((n): n is string => !!n);
  }, [makes.data]);
  return { manage, event, makes, zoneName, makeNames };
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
