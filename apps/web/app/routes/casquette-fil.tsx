import { Button } from "@orasso/design-system/web";
import { casquettesLabels as C, navLabels } from "@orasso/shared";
import { useLocation } from "react-router";

import { ActorLine } from "../components/casquette/ActorLine";
import { Fil } from "../components/fil/Fil";
import { StoriesBar } from "../components/stories/StoriesBar";
import { useCasquette } from "../lib/actor";
import { requireMe } from "../lib/api.server";
import type { Route } from "./+types/casquette-fil";

// Le Fil d'une casquette (lot R9h, T51, maquette R9 `n-fil`) : `/orga/:structure/fil`, `/pro/:pro/fil`, `/app/media/fil`,
// `/app/prestataire/fil`. La page `app-fil` rendue avec l'acteur de l'espace : la pastille « Tu lis en tant que », la barre des
// stories (« Ta story » au logo de la page), le Fil lu au nom de la page (« Abonnements » = ce que la page suit), « Publier » au
// nom de la page. Une seule route sous quatre chemins : l'acteur vient du layout de l'espace (`useCasquette()`).
export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  return { userId: me.user.id, pseudo: me.profile.pseudo, avatarUrl: me.profile.avatarUrl };
}

export function meta() {
  return [{ title: `${navLabels.fil.title} · Orasso` }, { name: "robots", content: "noindex" }];
}

export default function CasquetteFil({ loaderData }: Route.ComponentProps) {
  const casquette = useCasquette();
  const { pathname } = useLocation();
  if (!casquette) {
    // Page suspendue, survol en assistance ou casquette sans ligne : on ne lit ni n'agit au nom de la page (T48).
    return (
      <div className="fil" data-testid="casquette-fil-unavailable">
        <h1 className="s-h2">{C.filUnavailable}</h1>
        <p className="o-t-body">{C.filUnavailableText}</p>
        <Button variant="secondary" icon="undo" href={pathname.replace(/\/fil\/?$/, "") || "/"}>
          {C.filUnavailableBack}
        </Button>
      </div>
    );
  }
  return (
    <>
      <ActorLine casquette={casquette} />
      <h1 className="fil-sr">{navLabels.fil.title}</h1>
      <div className="stories-wrap">
        <StoriesBar userId={loaderData.userId} pseudo={loaderData.pseudo} avatarUrl={loaderData.avatarUrl} />
      </div>
      <Fil key={casquette.key} userId={loaderData.userId} />
    </>
  );
}
