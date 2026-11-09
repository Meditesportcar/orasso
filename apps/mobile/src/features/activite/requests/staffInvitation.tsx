// Invitation à rejoindre une structure (lot 24 ; carte sur `GET /me/requests`, `kind staff`, lot R7c2) : staff ou
// co-organisateur. Seul le destinataire répond ; `id` = la structure ; accepter ouvre l'onglet Accès (« Où je suis staff »).
import { staffRequestLabels } from "@orasso/shared";
import { useRouter } from "expo-router";

import { api } from "@/lib/api";

import { RequestCard } from "../RequestCard";
import { fromOf, payloadString, type RequestCardProps } from "./types";

export function StaffInvitation({ item, onDone }: RequestCardProps) {
  const router = useRouter();
  const { name, imageUrl } = fromOf(item);
  const slug = payloadString(item, "structureSlug");
  const invitedBy = payloadString(item, "invitedBy");
  return (
    <RequestCard
      testID="request-staff-invitation"
      avatarUrl={imageUrl}
      pseudo={name}
      title={`${staffRequestLabels.invited} · ${name}`}
      detail={[
        item.payload.role === "co_organizer" ? "Co-organisateur" : "Staff",
        invitedBy ? `proposé par ${invitedBy}` : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      onOpenProfile={slug ? () => router.push(`/o/${slug}`) : undefined}
      onAccept={async () => {
        await api.answerStaffInvitation(item.id, true);
        onDone();
      }}
      onDecline={async () => {
        await api.answerStaffInvitation(item.id, false);
        onDone();
      }}
    />
  );
}
