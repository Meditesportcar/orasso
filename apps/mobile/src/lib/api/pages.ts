// La page d'une structure et la fiche d'un pro vues par un visiteur (vague R8, lot R8g) : les mentions d'une page, « Masquer de la
// page », les publications d'une structure vues sans session, les pros partenaires d'une structure. Aucune règle ici : l'API les
// tient (visibilité, droits, second facteur).
import type {
  MediaContentView,
  MediaPage,
  MentionsPage,
  Page,
  PageFollowResult,
  ProCard,
  ProviderPage,
  PublicPostsPage,
} from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export const pagesApi = {
  /** `GET /authors/:key/mentions` ; `hidden` : les responsables voient aussi les mentions masquées (403 pour un autre). */
  authorMentions: (key: string, cursor?: string | null, hidden = false) =>
    request<MentionsPage>(
      `/api/authors/${encodeURIComponent(key)}/mentions${qs({ cursor, hidden: hidden ? "1" : undefined })}`,
    ),
  /** « Masquer de la page » / « Remettre sur la page » (responsables ; second facteur exigé pour une structure). */
  hideMention: (target: string, postId: string) =>
    request<unknown>(`/api/mentions/${encodeURIComponent(target)}/${encodeURIComponent(postId)}/hidden`, {
      method: "PUT",
    }),
  unhideMention: (target: string, postId: string) =>
    request<unknown>(`/api/mentions/${encodeURIComponent(target)}/${encodeURIComponent(postId)}/hidden`, {
      method: "DELETE",
    }),
  /** Sans session : seules les publications d'une structure, en liste blanche (T4). */
  publicAuthorPosts: (key: string, cursor?: string | null) =>
    request<PublicPostsPage>(`/api/authors/${encodeURIComponent(key)}/feed-posts${qs({ cursor })}`),
  /** Les pros partenaires d'une structure (publics). */
  structurePros: (slug: string) => request<ProCard[]>(`/api/structures/by-slug/${encodeURIComponent(slug)}/pros`),
  // Lot R9b : suivre un prestataire (`v:<id>`) ou un média (`m:<id>`), au nom de la casquette active (`actor`, T6 et T14 : en
  // casquette, c'est la page qui suit). Réponse : `{ following, followersCount }`.
  followPage: (targetKey: string, actor?: string | null) =>
    request<PageFollowResult>(`/api/me/page-follows/${encodeURIComponent(targetKey)}`, { method: "PUT", actor }),
  unfollowPage: (targetKey: string, actor?: string | null) =>
    request<PageFollowResult>(`/api/me/page-follows/${encodeURIComponent(targetKey)}`, { method: "DELETE", actor }),
  /** La page d'un prestataire (vitrine, avis, abonnement, anneau, compteurs) et celle d'un média. */
  providerById: (id: string, actor?: string | null) => request<ProviderPage>(`/api/providers/${id}`, { actor }),
  mediaById: (id: string, actor?: string | null) => request<MediaPage>(`/api/media/${id}`, { actor }),
  /** Les liens et galeries publics d'un média (onglet « Contenus » vu par un visiteur), page par page. */
  mediaPublicContents: (id: string, cursor?: string | null) =>
    request<Page<MediaContentView>>(`/api/media/${id}/contents${qs({ cursor })}`),
};
