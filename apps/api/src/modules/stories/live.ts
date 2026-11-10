// La story de l'organisateur « En cours » (lot R7h) : la dernière story vivante de sa structure, pour la fiche de
// l'événement (`organizerStoryAvailable`) et l'Accueil (`organizerStory`). Une structure est publique par nature : tout
// membre connecté la voit ; sans session, rien n'est servi (l'appelant ne passe ici que pour une personne connectée).
import { type HomeLive, storyAuthorKeyOf } from "@orasso/shared";
import { and, eq } from "drizzle-orm";

import { db } from "../../db/client";
import { stories } from "../../db/schema";
import type { Executor } from "../../lib/tx";
import { authorActive, liveStory, selectStories } from "./common";
import { mediaUrlOf, posterUrlOf } from "./serialize";

export async function organizerStoryOf(
  structureId: string,
  at: Date,
  ex: Executor = db,
): Promise<HomeLive["organizerStory"]> {
  const rows = (
    await selectStories(and(liveStory(at), eq(stories.persona, "organizer"), eq(stories.structureId, structureId)), ex)
  )
    .filter((r) => authorActive(r, at))
    .sort((a, b) => b.story.createdAt.getTime() - a.story.createdAt.getTime());
  const last = rows[0];
  if (!last) return null;
  return {
    structureKey: storyAuthorKeyOf("structure", structureId),
    // Une photo est son propre aperçu ; une vidéo sans affiche n'a pas d'aperçu : jamais l'adresse de la vidéo.
    posterUrl: last.story.posterKey
      ? posterUrlOf(last.story.id, last.story.posterKey)
      : last.story.mediaKind === "photo"
        ? mediaUrlOf(last.story.id, last.story.storageKey)
        : null,
  };
}
