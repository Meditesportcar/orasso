// La pastille du Fil d'une casquette (lot R9h, T51, maquette R9 `filR9` / `r9as`) : « Tu lis en tant que », le nom (jamais tronqué : il
// passe à la ligne), le logo, et « Changer » qui mène à « Mes casquettes » (`/app/moi`, où les casquettes vivent déjà).
import { Button, initialsOf } from "@orasso/design-system/web";
import { casquettesLabels as C } from "@orasso/shared";

import "../../styles/casquette.css";
import type { Casquette } from "../../lib/actor";

export function ActorLine({ casquette }: { casquette: Casquette }) {
  return (
    <div className="cas-line" data-testid="fil-actor">
      <span className="cas-line__logo" aria-hidden="true">
        {casquette.logoUrl ? <img src={casquette.logoUrl} alt="" /> : <span>{initialsOf(casquette.name)}</span>}
      </span>
      <p className="cas-line__text">
        <small className="o-t-credit">{C.readingAs}</small>
        <strong className="cas-line__name" data-testid="fil-actor-name">
          {casquette.name}
        </strong>
      </p>
      <Button
        variant="secondary"
        icon="sort"
        href="/app/moi"
        aria-label={C.changeHint}
        data-testid="fil-actor-change"
        className="cas-line__change"
      >
        {C.change}
      </Button>
    </div>
  );
}
