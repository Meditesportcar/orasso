// La vue « Une par une » (maquette R8.6 `pubCard`) : la carte entière du Fil (`cardFor("feed_post")`), réutilisée telle quelle, une
// sous l'autre ; la légende est repliée après trois lignes (« plus » / « moins », `FoldCaptions`). Le menu « ⋯ » de la carte
// ouvre celui de la publication (Supprimer pour la mienne, Signaler sinon).
import { type FeedPostView, publicationCard } from "@orasso/shared";
import { useState } from "react";

import "../../styles/fil.css";
import "../../styles/publications.css";
import { cardFor } from "../fil/Cards";
import { FoldCaptions } from "./FoldedCaption";
import { PostMenu } from "./PostMenu";

export function PublicationsOneByOne({ posts }: { posts: readonly FeedPostView[] }) {
  const [menu, setMenu] = useState<FeedPostView | null>(null);
  const Card = cardFor("feed_post");
  return (
    <FoldCaptions>
      <div className="pub-one" data-testid="publications-one-by-one">
        {posts.map((post) => (
          <Card key={post.id} card={publicationCard(post)} faded={false} onMenu={() => setMenu(post)} />
        ))}
      </div>
      <PostMenu post={menu} canDelete={Boolean(menu?.mine)} onClose={() => setMenu(null)} />
    </FoldCaptions>
  );
}
