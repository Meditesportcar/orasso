// « Demandes » de l'Activité (lot R7c2, maquette R7.2 `ac:dem`) : tout ce qui attend ta réponse (abonnement, crew,
// invitations à un événement, staff, transferts de plaque), une carte par demande, accepter ou refuser sur place. Les
// demandes de message ne sont pas ici : elles sont dans Messages.
import { inboxRowCounts, messagingLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useCallback } from "react";

import { api } from "@/lib/api";
import { useChannel } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { FlowScreen } from "@/ui/Screens";

import { RequestList, useRequestList } from "./RequestList";

export function RequestsScreen() {
  const router = useRouter();
  const { me, refreshMe } = useSession();
  const list = useRequestList((r) => r.kind !== "contact");
  const summary = useApi(() => api.inboxSummary(), []);
  const reloadAll = useCallback(async () => {
    await Promise.all([list.first.reload(), summary.reload(), refreshMe()]);
  }, [list.first.reload, summary.reload, refreshMe]);
  useChannel(me ? `user:${me.user.id}` : null, (event) => {
    if (event.type === "inbox.changed" || event.type === "notification") void reloadAll();
  });
  const { activityRequests } = inboxRowCounts(summary.data);
  const close = () => (router.canGoBack() ? router.back() : router.replace("/activite"));
  return (
    <FlowScreen
      title="Demandes"
      facts={activityRequests > 0 ? `${activityRequests} en attente de ta réponse` : undefined}
      onClose={close}
      closeLabel="Retour à l'Activité"
      onRefresh={reloadAll}
    >
      <RequestList list={list} empty={messagingLabels.noRequests} onChanged={() => void reloadAll()} />
    </FlowScreen>
  );
}
