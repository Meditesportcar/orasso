// Albums des médias (lot R9e) : brouillon, photos une à une, publication, lecture. Aucune règle métier ici (plafond de 200,
// accréditation, décision de plaque : côté API, dont les messages s'affichent tels quels).
import type {
  AlbumCreate,
  AlbumPatch,
  AlbumPhotoAdd,
  AlbumPhotoView,
  AlbumStatus,
  AlbumSummary,
  AlbumsList,
  AlbumView,
  FeedPostView,
} from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export const albumsApi = {
  /** Mes albums, brouillons compris (`status` filtre) ; par pages (curseur = dernier album lu). */
  myAlbums: (cursor?: string | null, status?: AlbumStatus) =>
    request<AlbumsList>(`/api/me/albums${qs({ cursor, status, limit: 30 })}`),
  album: (id: string) => request<AlbumView>(`/api/albums/${id}`),
  createAlbum: (body: AlbumCreate) => request<AlbumView>("/api/me/albums", { method: "POST", body }),
  patchAlbum: (id: string, body: Partial<AlbumPatch>) =>
    request<AlbumView>(`/api/me/albums/${id}`, { method: "PATCH", body }),
  deleteAlbum: (id: string) => request<null>(`/api/me/albums/${id}`, { method: "DELETE" }),
  addAlbumPhoto: (id: string, body: AlbumPhotoAdd) =>
    request<AlbumPhotoView>(`/api/me/albums/${id}/photos`, { method: "POST", body, timeout: 60_000 }),
  /** Annule l'ajout d'une tentative (`clientId`) : atomique et idempotent côté API, 204 = la photo n'est pas dans l'album et n'y entrera pas. */
  cancelAlbumPhoto: (id: string, clientId: string) =>
    request<null>(`/api/me/albums/${id}/photos/by-client/${clientId}`, { method: "DELETE" }),
  deleteAlbumPhoto: (id: string, photoId: string) =>
    request<null>(`/api/me/albums/${id}/photos/${photoId}`, { method: "DELETE" }),
  publishAlbum: (id: string) => request<AlbumView>(`/api/me/albums/${id}/publish`, { method: "POST" }),
  /** Lot R9g : les albums de la fiche d'un événement (publiés, l'officiel d'abord) ; `signedIn` faux : la liste publique (photos à l'adresse publique). */
  eventAlbums: (slug: string, signedIn: boolean) =>
    request<AlbumsList>(
      signedIn
        ? `/api/events/by-slug/${encodeURIComponent(slug)}/albums${qs({ limit: 50 })}`
        : `/api/public/events/by-slug/${encodeURIComponent(slug)}/albums${qs({ limit: 50 })}`,
    ),
  /** Lot R9g : l'organisateur pose (`on`) ou retire l'étoile « officiel » de l'album. */
  setAlbumOfficial: (eventId: string, albumId: string, on: boolean) =>
    request<AlbumSummary>(`/api/events/${eventId}/albums/${albumId}/official`, { method: on ? "PUT" : "DELETE" }),
  /** Lot R9g : l'organisateur reprend une photo dans le journal de l'événement (crédit du média conservé). */
  repostAlbumPhoto: (eventId: string, albumId: string, photoId: string, caption: string | null) =>
    request<FeedPostView>(`/api/events/${eventId}/albums/${albumId}/photos/${photoId}/repost`, {
      method: "POST",
      body: { caption },
    }),
  /** Les albums publiés d'une page de média (`GET /media/:id/albums`). */
  mediaAlbums: (mediaId: string, cursor?: string | null) =>
    request<AlbumsList>(`/api/media/${mediaId}/albums${qs({ cursor, limit: 20 })}`),
  /** Les liens d'une page de média (`kind=link` : les contenus d'avant, sans les albums mêlés), par pages au curseur. */
  mediaLinks: (mediaId: string, cursor?: string | null) =>
    request<{ items: import("@orasso/shared").MediaContentView[]; nextCursor: string | null }>(
      `/api/media/${mediaId}/contents${qs({ kind: "link", limit: 20, cursor })}`,
    ),
};
