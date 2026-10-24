// Recherche de premier niveau et Explorer (lot 29) : `GET /search`, événements triés par affinités ou distance, pros,
// fiche d'un pro, suivre une structure. Aucune règle métier ici : tri, filtres et confidentialité sont dans l'API.
import type { EventCard, EventSort, Page, ProActivityCounts, ProCard, ProPublic, SearchResults } from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

/** Réglages communs de position : celle de l'appareil pour cette requête seulement, jamais enregistrée par l'API. */
type Position = { lat?: number; lng?: number; radiusKm?: number };

/** Lot M4, tour 2 (« Autour de… ») : un autre département comme point de départ, et « Partout en France ». */
type Around = { around?: string; everywhere?: "1"; formats?: string };

/** Lot R2 (« Où chercher ? ») : des départements entiers (Mon coin, Ailleurs) ; le nombre en tout (première page). */
type R2Place = { departments?: string; withTotal?: "1" };

export type ExploreEventsQuery = Position &
  Around &
  R2Place & {
    q?: string;
    format?: string;
    categoryId?: string;
    department?: string;
    /** Instants ISO. */
    from?: string;
    to?: string;
    sort?: EventSort;
    /** Lot 44 : seulement les structures suivies. */
    followed?: "1";
    structureId?: string;
    /** Lot 55 (Explorer du média) : seulement les accréditations ouvertes ; région (code de `regions`). */
    accreditationOpen?: "1";
    region?: string;
    scope?: "upcoming" | "past";
    limit?: number;
    cursor?: string;
  };

export type ExploreProsQuery = Position &
  R2Place & {
    q?: string;
    activity?: string;
    department?: string;
    sort?: "name" | "distance";
    limit?: number;
    cursor?: string;
  };

export const explorerApi = {
  search: (q: string, limit = 5) => request<SearchResults>(`/api/search${qs({ q, limit })}`),
  exploreEvents: (query: ExploreEventsQuery) => request<Page<EventCard>>(`/api/events${qs({ limit: 20, ...query })}`),
  explorePros: (query: ExploreProsQuery) => request<Page<ProCard>>(`/api/pros${qs({ limit: 20, ...query })}`),
  /** Lot R2 (feuille « Quel métier ? ») : le nombre de pros de chaque métier, dans le même lieu. */
  proActivityCounts: (query: ExploreProsQuery) =>
    request<ProActivityCounts>(
      `/api/pros/activities${qs({ ...query, limit: undefined, cursor: undefined, withTotal: undefined })}`,
    ),
  proBySlug: (slug: string) => request<ProPublic>(`/api/pros/by-slug/${encodeURIComponent(slug)}`),
  followStructure: (id: string) => request<unknown>(`/api/structures/${id}/follow`, { method: "POST" }),
  followPro: (id: string) => request<unknown>(`/api/pros/${id}/follow`, { method: "POST" }),
  unfollowPro: (id: string) => request<unknown>(`/api/pros/${id}/follow`, { method: "DELETE" }),
  unfollowStructure: (id: string) => request<unknown>(`/api/structures/${id}/follow`, { method: "DELETE" }),
};
