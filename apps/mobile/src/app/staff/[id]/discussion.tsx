// Mode staff > Discussion (lot 20, docs/02 « Toujours accessibles en bas : alerte, main courante, discussion du
// staff ») : la conversation `event_staff` de l'événement, en Sable comme tout le mode staff. En ligne seulement (S22 :
// pas de file hors ligne, les scans restent prioritaires) ; fermée à J+1 (le staff ne la lit plus ensuite).
import { communicationLabels, type StaffConversationState } from "@orasso/shared";
import { useNetworkState } from "expo-network";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ConversationScreen } from "@/app/boite/[id]";
import { api } from "@/lib/api";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

export default function StaffDiscussion() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const network = useNetworkState();
  const online = network.isConnected !== false && network.isInternetReachable !== false;
  const [chat, setChat] = useState<StaffConversationState | null>(null);
  const [error, setError] = useState<{ closed: boolean; message: string } | null>(null);
  const close = useCallback(() => (router.canGoBack() ? router.back() : router.replace(`/staff/${id}`)), [router, id]);

  useEffect(() => {
    if (!online || chat) return;
    let cancelled = false;
    api
      .eventStaffConversation(id)
      .then((state) => {
        if (!cancelled) {
          setChat(state);
          setError(null);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        const closed = e instanceof ApiRequestError && e.code === "conversation_closed";
        setError({ closed, message: closed ? communicationLabels.staffDiscussionClosed : errorMessage(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [id, online, chat]);

  if (chat) {
    return (
      <ConversationScreen
        conversationId={chat.conversationId}
        onClose={close}
        header={!online ? <Notice>{communicationLabels.staffDiscussionOnline}</Notice> : undefined}
      />
    );
  }
  return (
    <FlowScreen title={communicationLabels.staffDiscussion} facts="Mode staff" onClose={close} still>
      {!online ? (
        <Notice>{communicationLabels.staffDiscussionOnline}</Notice>
      ) : error ? (
        <Notice tone={error.closed ? "info" : "error"}>{error.message}</Notice>
      ) : (
        <Muted variant="body">Chargement…</Muted>
      )}
    </FlowScreen>
  );
}
