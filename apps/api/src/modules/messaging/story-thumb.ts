// Vignette de la story à laquelle répond un message (lots R7c1 et R7f1). Servie par la route protégée
// `GET /api/stories/:id/thumb`, qui contrôle l'audience à chaque lecture ; `null` dès que la story n'existe plus
// (`messages.story_id` est remis à `null` à l'expiration ou à la suppression, voir `stories/expire.ts`).
import type { MessageRow } from "./core";

export function storyThumbFor(message: Pick<MessageRow, "storyId"> | null | undefined): string | null {
  return message?.storyId ? `/api/stories/${message.storyId}/thumb` : null;
}
