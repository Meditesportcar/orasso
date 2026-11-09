// Vignette de la story à laquelle répond un message (lot R7c1). La colonne `messages.story_id` n'existe pas encore (elle
// arrive avec les stories, lot R7f1) : la fonction ne lit rien et renvoie `null`. R7f1 la complète : vignette servie
// seulement tant que la story existe, et seulement si le lecteur peut encore la voir (invariant « Accueil, Activité,
// Messages »).
import type { messages } from "../../db/schema";

type MessageRow = typeof messages.$inferSelect;

export function storyThumbFor(_message: Pick<MessageRow, "id"> | null | undefined): string | null {
  return null;
}
