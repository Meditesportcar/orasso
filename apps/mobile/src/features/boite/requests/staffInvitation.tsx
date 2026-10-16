// Invitations à rejoindre une structure (lot 24) dans Boîte > Demandes : staff ou co-organisateur, avec les rôles
// proposés. Seul le destinataire répond ; accepter ouvre l'onglet Accès (« Où je suis staff »).
import { staffRequestLabels, staffRoleLabels } from "@orasso/shared";
import { useRouter } from "expo-router";

import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";

import { RequestCard } from "../RequestCard";
import type { RequestSectionProps } from "./types";

export function StaffInvitations({ onChanged, refreshKey }: RequestSectionProps) {
  const router = useRouter();
  const invitations = useApi(() => api.staffInvitations(), [refreshKey]);
  return (
    <>
      {(invitations.data ?? []).map((i) => (
        <RequestCard
          key={i.structureId}
          testID="request-staff-invitation"
          avatarUrl={i.logoUrl}
          pseudo={i.structureName}
          title={`${staffRequestLabels.invited} · ${i.structureName}`}
          detail={[
            i.role === "co_organizer" ? "Co-organisateur" : "Staff",
            ...i.staffRoles.map((r) => staffRoleLabels[r]),
            i.invitedBy ? `proposé par ${i.invitedBy}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          onOpenProfile={() => router.push(`/o/${i.structureSlug}`)}
          onAccept={async () => {
            await api.answerStaffInvitation(i.structureId, true);
            void invitations.reload();
            onChanged();
          }}
          onDecline={async () => {
            await api.answerStaffInvitation(i.structureId, false);
            void invitations.reload();
            onChanged();
          }}
        />
      ))}
    </>
  );
}
