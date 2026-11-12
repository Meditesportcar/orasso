// La page d'une structure et la fiche d'un pro vues par un visiteur (vague R8, lot R8g) : les mentions d'une page, « Masquer de la
// page », les publications d'une structure vues sans session, les pros partenaires d'une structure. Aucune règle ici : l'API les
// tient (visibilité, droits, second facteur).
import type { MentionsPage, ProCard, PublicPostsPage } from "@orasso/shared";

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
};
