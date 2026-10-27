// Demandes de crew (lot 19) dans Boîte > Demandes : demande reçue par le chef (accepter / refuser, refus silencieux) et
// invitation reçue (accepter / refuser).
import { crewInviteLabels, crewLabels } from "@orasso/shared";
import { useRouter } from "expo-router";

import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";

import { RequestCard } from "../RequestCard";
import type { RequestSectionProps } from "./types";

export function CrewRequests({ onChanged, refreshKey }: RequestSectionProps) {
  const router = useRouter();
  const requests = useApi(() => api.crewRequests(), [refreshKey]);
  const done = () => {
    void requests.reload();
    onChanged();
  };
  return (
    <>
      {(requests.data ?? []).map((r) => (
        <RequestCard
          key={`${r.kind}-${r.crew.id}-${r.person.userId}`}
          testID={`request-crew-${r.kind}`}
          avatarUrl={r.kind === "request" ? r.person.avatarUrl : r.crew.logoUrl}
          pseudo={r.kind === "request" ? r.person.pseudo : r.crew.name}
          title={
            r.kind === "request"
              ? crewLabels.requestFrom(r.person.pseudo, r.crew.name)
              : crewLabels.invitationFrom(r.crew.name)
          }
          // Lot R6c (R6.7) : l'invitation d'un membre (le chef confirmera), une demande née de cette invitation.
          detail={
            r.kind === "invitation"
              ? r.leaderConfirms
                ? `${crewInviteLabels.invitedBy(r.person.pseudo)} · ${crewInviteLabels.leaderConfirmsShort}`
                : crewLabels.leaderOf(r.person.pseudo)
              : r.invitedBy
                ? crewInviteLabels.invitedBy(r.invitedBy)
                : crewLabels.membersCount(r.crew.membersCount)
          }
          message={r.message}
          onOpenProfile={() =>
            r.kind === "request"
              ? router.push(`/u/${encodeURIComponent(r.person.pseudo)}`)
              : router.push(`/crew/${r.crew.slug}`)
          }
          onAccept={async () => {
            if (r.kind === "request") await api.acceptCrewRequest(r.crew.id, r.person.userId);
            else await api.acceptCrewInvitation(r.crew.id);
            done();
          }}
          onDecline={async () => {
            if (r.kind === "request") await api.declineCrewRequest(r.crew.id, r.person.userId);
            else await api.declineCrewInvitation(r.crew.id);
            done();
          }}
        />
      ))}
    </>
  );
}
