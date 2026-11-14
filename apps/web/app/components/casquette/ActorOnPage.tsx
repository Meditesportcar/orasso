// « Tu agis au nom de <casquette> » sur une page publique ouverte avec `?auteur=` (lot R9h partie 2, tour 1) : la pastille de la partie 1
// (`ActorLine`) au-dessus de l'en-tête, et « En mon nom » qui rouvre la même adresse sans `auteur`. Rien n'agit au nom d'une page sans
// que la page le dise : un lien reçu d'un tiers ne fait jamais suivre une structure en silence.
import { casquettesLabels as C } from "@orasso/shared";

import type { Casquette } from "../../lib/actor";
import { ActorLine } from "./ActorLine";

export function ActorOnPage({ casquette, ownHref }: { casquette: Casquette; ownHref: string }) {
  return (
    <ActorLine
      casquette={casquette}
      intro={C.actingAs}
      action={{ label: C.inMyName, href: ownHref, hint: C.inMyNameHint, icon: "undo" }}
      testId="page-actor"
      note={C.actingNote}
    />
  );
}
