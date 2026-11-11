// La page d'une publication seule sur le site (`/app/publication/:id` ; `GET /feed-posts/:id`) : la carte entière du Fil (photos,
// légende entière, flamme · partager), les commentaires dessous ; `?commentaires=1` ouvre la feuille des commentaires. Le menu
// « ⋯ » suit `manage` (Supprimer, avec confirmation). Retirée ou devenue invisible (404) : « Cette publication n'est plus
// visible. » et retour. Le lien d'une notification de publication mène ici (dette R7f4).
import { Button, Icon } from "@orasso/design-system/web";
import { type FeedPostWithManage, publicationsLabels as L, publicationCard } from "@orasso/shared";
import { useState } from "react";

import "../../styles/fil.css";
import "../../styles/publications.css";
import { FicheBar } from "../FicheBar";
import { cardFor } from "../fil/Cards";
import { PostMenu } from "./PostMenu";

export function PublicationPage({ post, back }: { post: FeedPostWithManage | null; back: string }) {
  const [menu, setMenu] = useState(false);
  const Card = cardFor("feed_post");
  return (
    <div className="pub-page" data-testid="publication-page">
      <FicheBar title={L.pageTitle} back={back} closeLabel={L.back} />
      {post ? (
        <>
          <Card card={publicationCard(post)} faded={false} onMenu={() => setMenu(true)} />
          <PostMenu
            post={menu ? post : null}
            canDelete={post.manage?.canDelete ?? post.mine}
            onClose={() => setMenu(false)}
            onRemoved={() => window.location.assign("/app/moi?onglet=publications")}
          />
        </>
      ) : (
        <div className="pub-state" data-testid="publication-gone">
          <Icon name="gallery" size={30} />
          <p className="o-t-body">{L.gone}</p>
          <Button variant="secondary" icon="back" href="/app/fil" data-testid="publication-gone-back">
            {L.goneBack}
          </Button>
        </div>
      )}
    </div>
  );
}
