// Demandes de contact reçues (lot 18) dans Boîte > Demandes : le message est affiché ; accepter ouvre la conversation,
// refuser est silencieux pour l'auteur.
import { gradeLabels, messagingLabels } from "@orasso/shared";
import { useRouter } from "expo-router";

import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";

import { RequestCard } from "../RequestCard";
import type { RequestSectionProps } from "./types";

export function ContactRequests({ onChanged, refreshKey }: RequestSectionProps) {
  const router = useRouter();
  const requests = useApi(() => api.contactRequests(), [refreshKey]);
  const items = (requests.data?.items ?? []).filter((r) => r.direction === "in");
  return (
    <>
      {items.map((r) => (
        <RequestCard
          key={r.id}
          testID="request-contact"
          avatarUrl={r.person.avatarUrl}
          pseudo={r.person.pseudo}
          title={`${r.person.pseudo} · ${messagingLabels.contactRequestFrom}`}
          detail={gradeLabels[r.person.grade]}
          message={r.message}
          onOpenProfile={() => router.push(`/u/${encodeURIComponent(r.person.pseudo)}`)}
          onAccept={async () => {
            const { conversationId } = await api.acceptContact(r.id);
            onChanged();
            router.push(`/boite/${conversationId}`);
          }}
          onDecline={async () => {
            await api.declineContact(r.id);
            void requests.reload();
            onChanged();
          }}
        />
      ))}
    </>
  );
}
