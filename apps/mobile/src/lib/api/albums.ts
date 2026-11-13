// Albums des médias (lot R9e) : brouillon, photos une à une, publication, lecture. Aucune règle métier ici (plafond de 200,
// accréditation, décision de plaque : côté API, dont les messages s'affichent tels quels).
import type {
  AlbumCreate,
  AlbumPatch,
  AlbumPhotoAdd,
  AlbumPhotoView,
  AlbumStatus,
  AlbumsList,
  AlbumTagCreate,
  AlbumTagRemove,
  AlbumTagView,
  AlbumView,
  MyAlbumTagsList,
  MyPhotosView,
  Taggable,
  TaggableQuery,
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
  /** Les albums publiés d'une page de média (`GET /media/:id/albums`). */
  mediaAlbums: (mediaId: string, cursor?: string | null) =>
    request<AlbumsList>(`/api/media/${mediaId}/albums${qs({ cursor, limit: 20 })}`),
  /** Les liens d'une page de média (`kind=link` : les contenus d'avant, sans les albums mêlés), par pages au curseur. */
  mediaLinks: (mediaId: string, cursor?: string | null) =>
    request<{ items: import("@orasso/shared").MediaContentView[]; nextCursor: string | null }>(
      `/api/media/${mediaId}/contents${qs({ kind: "link", limit: 20, cursor })}`,
    ),
  // Lot R9f : identifications sur une photo et « Tes photos ».
  /** Le plateau à choisir et la recherche par pseudo (2 caractères au moins pour les personnes). */
  albumTaggable: (id: string, q: Partial<Pick<TaggableQuery, "q" | "category" | "cursor">> = {}) =>
    request<Taggable>(`/api/albums/${id}/taggable${qs({ q: q.q, category: q.category, cursor: q.cursor })}`),
  tagPhoto: (photoId: string, body: AlbumTagCreate) =>
    request<AlbumTagView>(`/api/album-photos/${photoId}/tags`, { method: "POST", body }),
  /** Retirer une identification que j'ai posée (média, organisateur). */
  untagPhoto: (photoId: string, tagId: string) =>
    request<null>(`/api/album-photos/${photoId}/tags/${tagId}`, { method: "DELETE" }),
  /** « Ce n'est pas ma voiture » / « Retirer mon identification » : le même geste, le motif vient de l'API. */
  removeMyTag: (tagId: string, body: AlbumTagRemove = {}) =>
    request<null>(`/api/me/album-tags/${tagId}`, { method: "DELETE", body }),
  myPhotos: (albumId: string) => request<MyPhotosView>(`/api/me/albums/${albumId}/my-photos`),
  myAlbumTags: (cursor?: string | null) => request<MyAlbumTagsList>(`/api/me/album-tags${qs({ cursor })}`),
  /** « En story » : crée la story depuis la photo (aucun téléversement). */
  photoToStory: (photoId: string, body: { audience?: "public" | "followers"; caption?: string | null }) =>
    request<{ id: string; expiresAt: string }>(`/api/album-photos/${photoId}/share-to-story`, { method: "POST", body }),
  /** « Contacter » le média : la conversation s'ouvre avec le titulaire de la page (l'API ne donne jamais son compte). */
  contactAlbumMedia: (albumId: string) => request<{ id: string }>(`/api/albums/${albumId}/contact`, { method: "POST" }),
};
