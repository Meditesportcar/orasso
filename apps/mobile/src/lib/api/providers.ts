// Casquette Prestataire (lot 21) : mon profil et mes photos, les événements ouverts à mon type, mes candidatures,
// « Prestataires présents » d'un événement. Aucune règle métier ici : elles sont dans l'API.
import type {
  EventProviderPublic,
  OpenEventForProvider,
  ProviderApplicationCreate,
  ProviderApplicationView,
  ProviderProfileInput,
  ProviderProfileView,
} from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export const providersApi = {
  providerProfile: () => request<{ profile: ProviderProfileView | null }>("/api/me/provider-profile"),
  saveProviderProfile: (body: Omit<ProviderProfileInput, "departments"> & { departments?: string[] }) =>
    request<ProviderProfileView>("/api/me/provider-profile", { method: "PUT", body }),
  providerFromPro: () =>
    request<ProviderProfileView>("/api/me/provider-profile/from-pro", { method: "POST", body: {} }),
  uploadProviderPhoto: (form: FormData) =>
    request<ProviderProfileView>("/api/me/provider-profile/photos", { method: "POST", form, timeout: 60_000 }),
  deleteProviderPhoto: (photoId: string) =>
    request<ProviderProfileView>(`/api/me/provider-profile/photos/${photoId}`, { method: "DELETE" }),
  providerApplications: (scope: "upcoming" | "past") =>
    request<ProviderApplicationView[]>(`/api/me/provider-applications${qs({ scope })}`),
  openToProviders: () => request<OpenEventForProvider[]>("/api/events/open-to-providers"),
  applyAsProvider: (eventId: string, body: ProviderApplicationCreate) =>
    request<ProviderApplicationView>(`/api/events/${eventId}/provider-applications`, { method: "POST", body }),
  eventProviders: (slug: string) =>
    request<EventProviderPublic[]>(`/api/events/by-slug/${encodeURIComponent(slug)}/providers`),
};
