// Publier une story (lot R7f3, D38) : l'envoi de la photo se fait par `api.upload` (purpose `story`), puis `POST /me/stories`.
// La lecture des stories (barre, visionneuse) est dans `stories.ts` (lot R7f2). Aucune règle ici : l'API les tient.
import type { PeopleSearchPage, StoryAudience, StoryCreated, StoryPersona, storyBody } from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

/** Le corps de `POST /me/stories` construit par `storyBody` (`@orasso/shared`). */
export type StoryPublishBody = ReturnType<typeof storyBody>;

export const storiesPublishApi = {
  createStory: (body: StoryPublishBody) =>
    request<StoryCreated>("/api/me/stories", { method: "POST", body, timeout: 60_000 }),
  /** Les personnes qu'on peut identifier : seulement celles qui pourraient voir la story (`taggableFor`). */
  searchTaggable: (q: string, taggable: { taggableFor: StoryAudience; crewId?: string; persona: StoryPersona }) =>
    request<PeopleSearchPage>(`/api/users/search${qs({ limit: 8, q, ...taggable })}`),
};
