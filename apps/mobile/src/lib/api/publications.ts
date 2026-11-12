// Les publications d'un auteur et la publication seule (vague R8, lots R8a2 et R8b2). Aucune règle ici : l'API les tient
// (visibilité d'un compte privé, droits de gestion).
import type { AuthorPostsFilter, AuthorPostsPage, FeedPostWithManage } from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export const publicationsApi = {
  /** `key` : la clé d'auteur (`u:<compte>` pour une personne). Liste restreinte : `{ items: [], restricted: true }`. */
  authorPosts: (key: string, cursor?: string | null, filter?: AuthorPostsFilter) =>
    request<AuthorPostsPage>(`/api/authors/${encodeURIComponent(key)}/feed-posts${qs({ cursor, filter })}`),
  /** Une publication seule, avec ce que je peux en faire (`manage`). 404 : retirée ou devenue invisible. */
  feedPost: (id: string) => request<FeedPostWithManage>(`/api/feed-posts/${encodeURIComponent(id)}`),
};
