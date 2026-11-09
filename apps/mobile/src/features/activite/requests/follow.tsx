// Demande d'abonnement reçue (lot R6b, D37 ; carte sur `GET /me/requests` depuis le lot R7c2) : un compte privé accepte ou
// refuse (sans prévenir la personne). `id` = le demandeur, route `/me/follow-requests/:userId/…`.
import { followRequestNotificationTitle, gradeLabels } from "@orasso/shared";
import { useRouter } from "expo-router";

import { api } from "@/lib/api";

import { RequestCard } from "../RequestCard";
import { fromOf, payloadString, type RequestCardProps } from "./types";

export function FollowRequest({ item, onDone }: RequestCardProps) {
  const router = useRouter();
  const { name, imageUrl } = fromOf(item);
  const grade = payloadString(item, "grade") as keyof typeof gradeLabels | null;
  return (
    <RequestCard
      testID="request-follow"
      avatarUrl={imageUrl}
      pseudo={name}
      title={`${name} · ${followRequestNotificationTitle}`}
      detail={grade ? gradeLabels[grade] : null}
      onOpenProfile={() => router.push(`/u/${encodeURIComponent(name)}`)}
      onAccept={async () => {
        await api.acceptFollow(item.id);
        onDone();
      }}
      onDecline={async () => {
        await api.declineFollow(item.id);
        onDone();
      }}
    />
  );
}
