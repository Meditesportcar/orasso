// « Story de Kenji_66, ajoutée par Roues Libres 66 » (maquette R7.7 `.r7cred`) : le crédit d'une copie. Minimal dans le lot
// R7f2 (une ligne de texte) ; RÉSERVÉ au lot R7h, qui le complète.
import { storyViewerLabels as L, type StoryView } from "@orasso/shared";

export function SharedByLine({ story, authorName }: { story: StoryView; authorName: string }) {
  if (!story.sharedFrom) return null;
  return (
    <p className="story-view__shared o-t-caption" data-testid="story-shared-by">
      {L.sharedBy(story.sharedFrom.authorPseudo, authorName)}
    </p>
  );
}
