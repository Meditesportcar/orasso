// Social (lot 17 ; lot R6b : le suivi est dans `network.ts`) : profils des autres, véhicules des autres, recherche de
// personnes, résumé de la Boîte.
import type { InboxSummary, OtherVehicle, PeopleSearchPage, PeopleSuggestions, UserProfileView } from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export type PeopleFilters = {
  q?: string;
  department?: string;
  /** Lot R2, tour 2 : l'un de ces départements (« Mon coin » choisi). */
  departments?: string;
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
  peopleSuggestions: (departments?: string) =>
    request<PeopleSuggestions>(`/api/users/suggestions${qs({ departments })}`),
  searchPeople: (filters: PeopleFilters) =>
    request<PeopleSearchPage>(`/api/users/search${qs({ limit: 20, ...filters })}`),
  inboxSummary: () => request<InboxSummary>("/api/me/inbox/summary"),
};
