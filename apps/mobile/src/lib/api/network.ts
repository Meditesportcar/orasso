// Lot R4c : véhicule principal, suivre une personne, listes du réseau (visibles par soi seul), aperçu du profil public.
import type {
  FollowersPage,
  FollowingKind,
  FollowingPage,
  FollowResult,
  FriendItem,
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
  friendsSearch: (q?: string) => request<{ items: FriendItem[] }>(`/api/me/friends${qs({ q })}`),
  publicPreviewAs: (as: PreviewAs) => request<PublicPreview>(`/api/me/public-preview${qs({ as })}`),
};
