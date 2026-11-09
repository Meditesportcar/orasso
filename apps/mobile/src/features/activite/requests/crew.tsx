// Crews (lot 19 ; cartes sur `GET /me/requests`, lot R7c2) : la demande d'une personne à rejoindre mon crew (je suis chef :
// `kind crew`, variante `join_request` ; la venue en crew à confirmer est l'autre variante, `crewConfirmation.tsx`) et
// l'invitation que j'ai reçue (`kind crew_invitation`).
import { crewInviteLabels, crewLabels } from "@orasso/shared";
import { useRouter } from "expo-router";

import { api } from "@/lib/api";

import { RequestCard } from "../RequestCard";
import { CrewConfirmation } from "./crewConfirmation";
import { fromOf, payloadObject, payloadString, type RequestCardProps, textOf } from "./types";

/** `kind crew` : la demande d'une personne (je suis chef) ou une venue en crew à confirmer. */
export function CrewRequest({ item, onDone }: RequestCardProps) {
  return item.payload.variant === "confirmation" ? (
    <CrewConfirmation item={item} onDone={onDone} />
  ) : (
    <CrewJoinRequest item={item} onDone={onDone} />
  );
}

function CrewJoinRequest({ item, onDone }: RequestCardProps) {
  const router = useRouter();
  const { name, imageUrl } = fromOf(item);
  const crewName = textOf(payloadObject(item, "crew"), "name") ?? "";
  const requesterId = payloadString(item, "requesterId") ?? "";
  const invitedBy = payloadString(item, "invitedBy");
  return (
    <RequestCard
      testID="request-crew-request"
      avatarUrl={imageUrl}
      pseudo={name}
      title={crewLabels.requestFrom(name, crewName)}
      // Lot R6c (R6.7) : une demande née de l'invitation d'un membre.
      detail={invitedBy ? crewInviteLabels.invitedBy(invitedBy) : null}
      message={payloadString(item, "message")}
      onOpenProfile={() => router.push(`/u/${encodeURIComponent(name)}`)}
      onAccept={async () => {
        await api.acceptCrewRequest(item.id, requesterId);
        onDone();
      }}
      onDecline={async () => {
        await api.declineCrewRequest(item.id, requesterId);
        onDone();
      }}
    />
  );
}

/** `kind crew_invitation` : `id` = le crew, `from` = la personne qui invite (le chef, ou un membre). */
export function CrewInvitation({ item, onDone }: RequestCardProps) {
  const router = useRouter();
  const { name: inviter } = fromOf(item);
  const crew = payloadObject(item, "crew");
  const crewName = textOf(crew, "name") ?? "";
  const slug = textOf(crew, "slug");
  const leaderConfirms = item.payload.leaderConfirms === true;
  return (
    <RequestCard
      testID="request-crew-invitation"
      avatarUrl={textOf(crew, "logoUrl")}
      pseudo={crewName}
      title={crewLabels.invitationFrom(crewName)}
      // Lot R6c (R6.7) : l'invitation d'un membre (le chef confirmera).
      detail={
        leaderConfirms
          ? `${crewInviteLabels.invitedBy(inviter)} · ${crewInviteLabels.leaderConfirmsShort}`
          : crewLabels.leaderOf(inviter)
      }
      onOpenProfile={slug ? () => router.push(`/crew/${slug}`) : undefined}
      onAccept={async () => {
        await api.acceptCrewInvitation(item.id);
        onDone();
      }}
      onDecline={async () => {
        await api.declineCrewInvitation(item.id);
        onDone();
      }}
    />
  );
}
