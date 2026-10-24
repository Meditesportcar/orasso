// Social (lot 17) : profils des autres, véhicules des autres, recherche de personnes, amis, QR ami.
import type {
  FriendItem,
  FriendRequestResult,
  FriendRequestView,
  InboxSummary,
  OtherVehicle,
  PeopleSearchPage,
  PeopleSuggestions,
  UserProfileView,
} from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export type PeopleFilters = {
  q?: string;
  department?: string;
  categoryId?: string;
  grade?: string;
  cursor?: string;
};

export const socialApi = {
  userProfile: (pseudo: string) => request<UserProfileView>(`/api/users/${encodeURIComponent(pseudo)}`),
  otherVehicle: (id: string) => request<OtherVehicle>(`/api/vehicles/${id}`),
  ownersNearby: (id: string, cursor?: string) =>
    request<PeopleSearchPage & { sector: string[] }>(`/api/vehicles/${id}/owners-nearby${qs({ limit: 20, cursor })}`),
  /** Lot R2 : « Même modèle que toi » (comptes publics seulement), dans le département choisi s'il y en a un. */
  peopleSuggestions: (department?: string) => request<PeopleSuggestions>(`/api/users/suggestions${qs({ department })}`),
  searchPeople: (filters: PeopleFilters) =>
    request<PeopleSearchPage>(`/api/users/search${qs({ limit: 20, ...filters })}`),
  friends: () => request<{ items: FriendItem[] }>("/api/me/friends"),
  friendRequests: () => request<{ items: FriendRequestView[] }>("/api/me/friends/requests"),
  inboxSummary: () => request<InboxSummary>("/api/me/inbox/summary"),
  requestFriend: (pseudo: string, source: "profile" | "search" = "profile") =>
    request<FriendRequestResult>("/api/friends/requests", { method: "POST", body: { pseudo, source } }),
  requestFriendByQr: (payload: string) =>
    request<FriendRequestResult>("/api/friends/requests/by-qr", { method: "POST", body: { payload } }),
  requestFriendByInvite: (token: string) =>
    request<FriendRequestResult>("/api/friends/requests/by-invite", { method: "POST", body: { token } }),
  acceptFriend: (id: string) => request<FriendRequestResult>(`/api/friends/requests/${id}/accept`, { method: "POST" }),
  declineFriend: (id: string) => request<unknown>(`/api/friends/requests/${id}/decline`, { method: "POST" }),
  removeFriend: (userId: string) => request<unknown>(`/api/friends/${userId}`, { method: "DELETE" }),
};
