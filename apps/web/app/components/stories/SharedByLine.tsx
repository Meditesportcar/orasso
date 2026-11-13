// « Story de Kenji_66, ajoutée par Roues Libres 66 » (maquette R7.7 `.r7cred`) : le crédit d'une copie, en pastille avec
// l'avatar de l'auteur d'origine et son nom en gras. C'est l'identité PUBLIQUE de l'originale (la personne, la structure ou
// le pro selon sa casquette) ; le nom ouvre le profil, la page de la structure ou la fiche correspondante (lot R7h).
import { albumLabels, storyViewerLabels as L, type StoryTagView, type StoryView } from "@orasso/shared";

const hrefOf = (t: StoryTagView) =>
  !t.slug
    ? null
    : t.kind === "user"
      ? `/u/${encodeURIComponent(t.slug)}`
      : t.kind === "structure"
        ? `/o/${t.slug}`
        : `/p/${t.slug}`;

export function SharedByLine({ story, authorName }: { story: StoryView; authorName: string }) {
  const credit = story.sharedFrom;
  // Lot R9f : une story reprise d'une photo d'album porte « Photos : <média> », le crédit du photographe, qui ne se retire pas.
  if (!credit) {
    return story.credit ? (
      <p className="story-view__shared o-t-caption" data-testid="story-photo-credit">
        {albumLabels.creditLine(story.credit.mediaName)}
      </p>
    ) : null;
  }
  const name = credit.name;
  const full = L.sharedBy(name, authorName);
  const at = name ? full.indexOf(name) : -1;
  const href = hrefOf(credit);
  return (
    <p className="story-view__shared o-t-caption" data-testid="story-shared-by">
      <span className="story-view__shared-av" aria-hidden="true">
        {credit.avatarUrl ? <img src={credit.avatarUrl} alt="" /> : <span>{name.charAt(0).toUpperCase()}</span>}
      </span>
      <span>
        {at < 0 ? (
          full
        ) : (
          <>
            {full.slice(0, at)}
            {href ? (
              <a className="story-view__shared-link" href={href} data-testid="story-shared-by-author">
                {name}
              </a>
            ) : (
              <b data-testid="story-shared-by-author">{name}</b>
            )}
            {full.slice(at + name.length)}
          </>
        )}
      </span>
    </p>
  );
}
