// La vue « Une par une » (maquette R8.6 `pubCard`) : la carte entière du Fil (`cardFor("feed_post")`), réutilisée telle quelle, une
// sous l'autre ; la légende est repliée après trois lignes (« plus » / « moins », `FoldCaptions`). Le menu « ⋯ » de la carte
// ouvre celui de la publication (Supprimer pour la mienne, Signaler sinon).
import { type FeedPostView, publicationCard } from "@orasso/shared";
import { useState } from "react";

import "../../styles/fil.css";
import "../../styles/publications.css";
import { JournalBadges, type JournalOptions } from "../event-journal/JournalBadges";
import { cardFor } from "../fil/Cards";
import { FoldCaptions } from "./FoldedCaption";
import { PostMenu } from "./PostMenu";

/**
 * `journal` (lot R8d, fiche d'un événement) : les étiquettes au-dessus de chaque carte, et le menu « … » est celui de la fiche
 * (`onMenu`, qui porte « Épingler en tête » pour l'organisateur) ; sans `journal`, la brique ne change pas.
 */
export function PublicationsOneByOne({ posts, journal }: { posts: readonly FeedPostView[]; journal?: JournalOptions }) {
  const [menu, setMenu] = useState<FeedPostView | null>(null);
  const Card = cardFor("feed_post");
  return (
    <FoldCaptions>
      <div className="pub-one" data-testid="publications-one-by-one">
        {posts.map((post) => (
          <div key={post.id} className={journal ? "evj-item" : undefined}>
            {journal ? <JournalBadges post={post} /> : null}
            <Card
              card={publicationCard(post)}
              faded={false}
              onMenu={() => (journal?.onMenu ? journal.onMenu(post) : setMenu(post))}
            />
          </div>
        ))}
      </div>
      {journal?.onMenu ? null : <PostMenu post={menu} canDelete={Boolean(menu?.mine)} onClose={() => setMenu(null)} />}
    </FoldCaptions>
  );
}
