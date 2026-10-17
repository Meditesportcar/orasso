// Accueil complet (lot 30) : une seule requête agrégée, le réglage des widgets, le garage favori et l'emplacement
// sponsorisé. Aucune règle ici : le rayon, la position (arrondie par l'API, jamais enregistrée), les sources externes et
// leur cache sont côté API.
import type { HomeData, HomeWidgetsConfig } from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export type HomeQuery = { radiusKm?: number; lat?: number; lng?: number };

export const homeApi = {
  homeData: (query: HomeQuery = {}) => request<HomeData>(`/api/me/home${qs(query)}`),
  setHomeWidgets: (config: HomeWidgetsConfig) =>
    request<HomeWidgetsConfig>("/api/me/home/widgets", { method: "PUT", body: config }),
  setFavoritePro: (proId: string) => request<unknown>(`/api/pros/${proId}/favorite`, { method: "POST" }),
  unsetFavoritePro: (proId: string) => request<unknown>(`/api/pros/${proId}/favorite`, { method: "DELETE" }),
  sponsoredClick: (id: string) => request<unknown>(`/api/sponsored/${id}/click`, { method: "POST" }),
  /** Compteurs de la fiche pro (lot 14) : « appeler » et « itinéraire » du garage favori. */
  trackPro: (slug: string, kind: "call" | "route") =>
    request<unknown>(`/api/pros/by-slug/${encodeURIComponent(slug)}/track`, { method: "POST", body: { kind } }),
};
