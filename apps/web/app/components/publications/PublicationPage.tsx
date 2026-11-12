// La page d'une publication seule sur le site (`/app/publication/:id` ; `GET /feed-posts/:id`) : la carte entière du Fil (photos,
// légende entière, flamme · partager), les commentaires dessous ; `?commentaires=1` ouvre la feuille des commentaires. Le menu
// « ⋯ » suit `manage` (Supprimer, avec confirmation). Retirée ou devenue invisible (404) : « Cette publication n'est plus
// visible. » et retour. Le lien d'une notification de publication mène ici (dette R7f4).
import { Button, Icon } from "@orasso/design-system/web";
import { type FeedPostWithManage, publicationsLabels as L, publicationCard } from "@orasso/shared";
import { useEffect, useRef, useState } from "react";

import "../../styles/fil.css";
import "../../styles/publications.css";
import { FicheBar } from "../FicheBar";
import { cardFor } from "../fil/Cards";
import { postLive } from "../fil/commentsLive";
import { PostMenu } from "./PostMenu";
import { onPostChanged } from "./signal";

export function PublicationPage({ post, back }: { post: FeedPostWithManage | null; back: string }) {
  const [menu, setMenu] = useState(false);
  const Card = cardFor("feed_post");
  // `?commentaires=1` (le lien d'une notification de commentaire) : la feuille de R8k2 s'ouvre une fois la publication affichée.
  const opened = useRef(false);
  const postId = post?.id ?? null;
  useEffect(() => {
    if (!postId || opened.current || new URLSearchParams(window.location.search).get("commentaires") !== "1") return;
    opened.current = true;
    postLive.open(postId, false);
  }, [postId]);
  // Collaboration (R8o) : un co-auteur retiré ou une invitation annulée depuis le menu relit la page.
  // Après le temps de lire la confirmation du menu (la page seule se recharge, la confirmation disparaîtrait).
  useEffect(
    () =>
      onPostChanged((id) => {
        if (id === postId) setTimeout(() => window.location.reload(), 2000);
      }),
    [postId],
  );
  return (
    <div className="pub-page" data-testid="publication-page">
      <FicheBar title={L.pageTitle} back={back} closeLabel={L.back} />
      {post ? (
        <>
          <Card card={publicationCard(post)} faded={false} onMenu={() => setMenu(true)} />
          <PostMenu
            post={menu ? post : null}
            canDelete={post.manage?.canDelete ?? post.mine}
            canCommentsOff={post.manage?.canCommentsOff ?? false}
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
