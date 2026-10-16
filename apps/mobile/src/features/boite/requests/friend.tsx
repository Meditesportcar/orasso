// Demandes d'ami reçues (lot 17) dans Boîte > Demandes.
import { gradeLabels, messagingLabels } from "@orasso/shared";
import { useRouter } from "expo-router";

import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";

import { RequestCard } from "../RequestCard";
import type { RequestSectionProps } from "./types";

export function FriendRequests({ onChanged, refreshKey }: RequestSectionProps) {
  const router = useRouter();
  const requests = useApi(() => api.friendRequests(), [refreshKey]);
  const items = (requests.data?.items ?? []).filter((r) => r.direction === "in");
  const after = () => {
    void requests.reload();
    onChanged();
  };
  return (
    <>
      {items.map((r) => (
        <RequestCard
          key={r.id}
          testID="request-friend"
          avatarUrl={r.person.avatarUrl}
          pseudo={r.person.pseudo}
          title={`${r.person.pseudo} · ${messagingLabels.friendRequestFrom}`}
          detail={gradeLabels[r.person.grade]}
          message={r.message}
          onOpenProfile={() => router.push(`/u/${encodeURIComponent(r.person.pseudo)}`)}
          onAccept={async () => {
            await api.acceptFriend(r.id);
            after();
          }}
          onDecline={async () => {
            await api.declineFriend(r.id);
            after();
          }}
        />
      ))}
    </>
  );
}
