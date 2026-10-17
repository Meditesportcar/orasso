// Pastille de l'onglet Staff de l'organisateur (lot 35a) : un point sur l'onglet tant qu'une demande pour devenir staff
// attend une réponse. Le nombre vient du résumé de la Boîte de la structure (`staffRequests`) ; l'écran Équipe prévient
// la barre quand il traite une demande, et le canal du compte (« inbox.changed ») la prévient quand une demande arrive.
import { useEffect } from "react";

import { api } from "./api";
import { useChannel } from "./realtime";
import { useSession } from "./session";
import { useApi } from "./useApi";

const listeners = new Set<() => void>();

/** Une demande vient d'être traitée : la barre relit le résumé. */
export const emitTeamChanged = (): void => {
  for (const listener of listeners) listener();
};

/** Nombre de demandes de staff en attente pour la structure active (0 hors casquette Organisateur). */
export function useTeamRequestsCount(structureId: string | null): number {
  const { me } = useSession();
  const summary = useApi(() => api.orgInboxSummary(structureId as string), [structureId], {
    enabled: structureId !== null,
    refreshMs: 60_000,
  });
  const reload = summary.reload;
  useEffect(() => {
    const listener = () => void reload();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [reload]);
  useChannel(structureId && me ? `user:${me.user.id}` : null, (event) => {
    if (event.type === "inbox.changed" || event.type === "conversation.updated") void reload();
  });
  return structureId ? (summary.data?.staffRequests ?? 0) : 0;
}
