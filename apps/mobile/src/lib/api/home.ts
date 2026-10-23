// Accueil complet (lot 30) : une seule requête agrégée, le réglage des widgets, le garage favori et l'emplacement
// sponsorisé. Aucune règle ici : le rayon, la position (arrondie par l'API, jamais enregistrée), les sources externes et
// leur cache sont côté API.
import type { HomeData, HomeWidgetsConfig, PersonaKind, RecapView } from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export type HomeQuery = {
  radiusKm?: number;
  lat?: number;
  lng?: number;
  persona?: PersonaKind;
  light?: "1";
  blocks?: "v2" | "places";
};

export const homeApi = {
  homeData: (query: HomeQuery = {}) => request<HomeData>(`/api/me/home${qs(query)}`),
  setHomeWidgets: (config: HomeWidgetsConfig) =>
    request<HomeWidgetsConfig>("/api/me/home/widgets", { method: "PUT", body: config }),
  setFavoritePro: (proId: string) => request<unknown>(`/api/pros/${proId}/favorite`, { method: "POST" }),
  unsetFavoritePro: (proId: string) => request<unknown>(`/api/pros/${proId}/favorite`, { method: "DELETE" }),
  /** Lot 43 : mon rang au prix du public d'un événement fini (via le récap, calculé à la demande ; `null` avant J+1 10 h). */
  eventAudienceRank: (eventId: string) =>
    request<RecapView>(`/api/me/recaps/${eventId}`)
      .then((r) => r.audienceRank)
      .catch(() => null),
  sponsoredClick: (id: string) => request<unknown>(`/api/sponsored/${id}/click`, { method: "POST" }),
  /** Lot M5, tour 2 : l'emplacement du Garage vient d'apparaître à l'écran (compté une fois par jour). */
  sponsoredImpression: (id: string) => request<unknown>(`/api/sponsored/${id}/impression`, { method: "POST" }),
  /** Compteurs de la fiche pro (lot 14) : « appeler » et « itinéraire » du garage favori. */
  trackPro: (slug: string, kind: "call" | "route") =>
    request<unknown>(`/api/pros/by-slug/${encodeURIComponent(slug)}/track`, { method: "POST", body: { kind } }),
};
