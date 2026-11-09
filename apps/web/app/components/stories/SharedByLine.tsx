// « Story de Kenji_66, ajoutée par Roues Libres 66 » (maquette R7.7 `.r7cred`) : le crédit d'une copie. Le nom de l'auteur
// d'origine ouvre son profil (lot R7h).
import { storyViewerLabels as L, type StoryView } from "@orasso/shared";

export function SharedByLine({ story, authorName }: { story: StoryView; authorName: string }) {
  if (!story.sharedFrom) return null;
  const pseudo = story.sharedFrom.authorPseudo;
  const full = L.sharedBy(pseudo, authorName);
  const at = pseudo ? full.indexOf(pseudo) : -1;
  return (
    <p className="story-view__shared o-t-caption" data-testid="story-shared-by">
      {at < 0 ? (
        full
      ) : (
        <>
          {full.slice(0, at)}
          <a href={`/u/${encodeURIComponent(pseudo)}`} data-testid="story-shared-by-author">
            {pseudo}
          </a>
          {full.slice(at + pseudo.length)}
        </>
      )}
    </p>
  );
}
