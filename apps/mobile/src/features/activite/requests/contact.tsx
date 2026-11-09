// Demande de message reçue (lot 18 ; carte sur `GET /me/requests`, écran « Demandes de message » de Messages, lot R7c2) :
// le message est affiché ; accepter ouvre la conversation, refuser est silencieux pour l'auteur.
import { gradeLabels, messagingLabels } from "@orasso/shared";
import { useRouter } from "expo-router";

import { api } from "@/lib/api";

import { RequestCard } from "../RequestCard";
import { fromOf, payloadString, type RequestCardProps } from "./types";

export function ContactRequest({ item, onDone }: RequestCardProps) {
  const router = useRouter();
  const { name, imageUrl } = fromOf(item);
  const grade = payloadString(item, "grade") as keyof typeof gradeLabels | null;
  return (
    <RequestCard
      testID="request-contact"
      avatarUrl={imageUrl}
      pseudo={name}
      title={`${name} · ${messagingLabels.contactRequestFrom}`}
      detail={grade ? gradeLabels[grade] : null}
      message={payloadString(item, "message")}
      onOpenProfile={() => router.push(`/u/${encodeURIComponent(name)}`)}
      onAccept={async () => {
        const { conversationId } = await api.acceptContact(item.id);
        onDone();
        router.push(`/messages/${conversationId}`);
      }}
      onDecline={async () => {
        await api.declineContact(item.id);
        onDone();
      }}
    />
  );
}
