// Invitations à un événement (lot 25) dans Boîte > Demandes : la carte de l'invitation. La réponse (véhicule,
// règlement) se fait dans Accès, comme la confirmation d'une venue en crew.
import { useRouter } from "expo-router";

import { InvitationCard } from "@/features/invitations/ReceivedInvitations";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";

import type { RequestSectionProps } from "./types";

export function EventInvitations({ refreshKey }: RequestSectionProps) {
  const router = useRouter();
  const items = useApi(() => api.myEventInvitations(), [refreshKey]);
  return (
    <>
      {(items.data ?? []).map((inv) => (
        <InvitationCard
          key={inv.id}
          inv={inv}
          onAnswer={() => router.push("/acces")}
          onOpenEvent={() => router.push(`/e/${inv.event.slug}`)}
        />
      ))}
    </>
  );
}
