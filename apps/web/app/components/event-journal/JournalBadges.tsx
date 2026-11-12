// Les deux étiquettes d'une publication du journal d'un événement : « Épinglée » et « Inscrits prévenus » (maquette R8.5 `pinB` et
// `notifB`, `.r8pin`). Posées par la fiche de l'événement (lot R8d) sur les vignettes et les cartes de la brique de liste ; la
// liste d'un profil n'en pose jamais.
import { Icon } from "@orasso/design-system/web";
import { type FeedPostView, journalBadges, eventJournalLabels as L } from "@orasso/shared";

import "../../styles/event-journal.css";

/** Ce que la fiche donne à la liste : le menu « … » de l'organisateur et, sans session, des vignettes qui ne mènent nulle part. */
export type JournalOptions = { onMenu?: (post: FeedPostView) => void; readOnly?: boolean };

export function JournalBadges({ post, floating = false }: { post: FeedPostView; floating?: boolean }) {
  const badges = journalBadges(post);
  if (!badges.pinned && !badges.notified) return null;
  return (
    <div className={`evj-badges${floating ? " evj-badges--floating" : ""}`}>
      {badges.pinned ? (
        <span className="evj-badge evj-badge--pinned" data-testid="journal-pinned">
          <Icon name="star" size={12} />
          {L.pinned}
        </span>
      ) : null}
      {badges.notified ? (
        <span className="evj-badge" data-testid="journal-notified">
          <Icon name="bell" size={12} />
          {L.notified}
        </span>
      ) : null}
    </div>
  );
}
