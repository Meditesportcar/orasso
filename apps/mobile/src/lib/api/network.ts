// Lot R4c : véhicule principal, suivre une personne, listes du réseau (visibles par soi seul), aperçu du profil public.
// Lot R6b (D37) : un seul lien, « Suivre » (compte privé : demande acceptée ou refusée) ; plus d'amitié.
import type {
  FollowersPage,
  FollowingKind,
  FollowingPage,
  FollowPerson,
  FollowRequestsPage,
  FollowResult,
  NetworkCounts,
  PreviewAs,
  PublicPreview,
} from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export const networkApi = {
  setMainVehicle: (vehicleId: string) =>
    request<{ mainVehicleId: string }>("/api/me/main-vehicle", { method: "PUT", body: { vehicleId } }),
  follow: (pseudo: string) =>
    request<FollowResult>(`/api/users/${encodeURIComponent(pseudo)}/follow`, { method: "POST" }),
  unfollow: (pseudo: string) =>
    request<FollowResult>(`/api/users/${encodeURIComponent(pseudo)}/follow`, { method: "DELETE" }),
  network: () => request<NetworkCounts>("/api/me/network"),
  followers: (q?: string, cursor?: string) => request<FollowersPage>(`/api/me/followers${qs({ q, cursor })}`),
  following: (kind: FollowingKind, q?: string, cursor?: string) =>
    request<FollowingPage>(`/api/me/following${qs({ kind, q, cursor })}`),
  /** Lot R6b : les demandes d'abonnement reçues (compte privé), moi seul. */
  followRequests: (q?: string, cursor?: string) =>
    request<FollowRequestsPage>(`/api/me/follow-requests${qs({ q, cursor })}`),
  acceptFollow: (userId: string) =>
    request<FollowPerson>(`/api/me/follow-requests/${userId}/accept`, { method: "POST" }),
  /** Refuser : la personne n'est pas prévenue. */
  declineFollow: (userId: string) => request<unknown>(`/api/me/follow-requests/${userId}/decline`, { method: "POST" }),
  /** QR de compte (`OA1…`) et lien de profil : suivre la personne (ou lui demander, si son compte est privé). */
  followByQr: (payload: string) =>
    request<FollowResult & { pseudo: string }>("/api/follows/by-qr", { method: "POST", body: { payload } }),
  followByInvite: (token: string) =>
    request<FollowResult & { pseudo: string }>("/api/follows/by-invite", { method: "POST", body: { token } }),
  publicPreviewAs: (as: PreviewAs) => request<PublicPreview>(`/api/me/public-preview${qs({ as })}`),
};
