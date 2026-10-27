// Demandes d'abonnement reçues (lot R6b, D37 : elles remplacent les demandes d'ami) dans Boîte > Demandes : un compte
// privé accepte ou refuse (sans prévenir la personne).
import { followRequestNotificationTitle, gradeLabels } from "@orasso/shared";
import { useRouter } from "expo-router";

import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";

import { RequestCard } from "../RequestCard";
import type { RequestSectionProps } from "./types";

export function FollowRequests({ onChanged, refreshKey }: RequestSectionProps) {
  const router = useRouter();
  const requests = useApi(() => api.followRequests(), [refreshKey]);
  const after = () => {
    void requests.reload();
    onChanged();
  };
  return (
    <>
      {(requests.data?.items ?? []).map((p) => (
        <RequestCard
          key={p.userId}
          testID="request-follow"
          avatarUrl={p.avatarUrl}
          pseudo={p.pseudo}
          title={`${p.pseudo} · ${followRequestNotificationTitle}`}
          detail={p.vehicle ?? gradeLabels[p.grade]}
          onOpenProfile={() => router.push(`/u/${encodeURIComponent(p.pseudo)}`)}
          onAccept={async () => {
            await api.acceptFollow(p.userId);
            after();
          }}
          onDecline={async () => {
            await api.declineFollow(p.userId);
            after();
          }}
        />
      ))}
    </>
  );
}
