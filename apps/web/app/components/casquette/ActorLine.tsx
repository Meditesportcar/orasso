// La pastille du Fil d'une casquette (lot R9h, T51, maquette R9 `filR9` / `r9as`) : « Tu lis en tant que », le nom (jamais tronqué : il
// passe à la ligne), le logo, et « Changer » qui mène à « Mes casquettes » (`/app/moi`, où les casquettes vivent déjà).
// Sur une page publique ouverte au nom d'une casquette (`?auteur=`, partie 2, tour 1), la même pastille dit « Tu agis au nom de » et
// son bouton est « En mon nom » (la même adresse sans `auteur`) : on ne suit jamais au nom d'une page sans que rien ne le dise.
import { Button, initialsOf } from "@orasso/design-system/web";
import { casquettesLabels as C } from "@orasso/shared";

import "../../styles/casquette.css";
import type { Casquette } from "../../lib/actor";

export function ActorLine({
  casquette,
  intro = C.readingAs,
  action = { label: C.change, href: "/app/moi", hint: C.changeHint, icon: "sort" },
  testId = "fil-actor",
  note,
}: {
  casquette: Casquette;
  intro?: string;
  action?: { label: string; href: string; hint: string; icon: "sort" | "undo" };
  testId?: string;
  /** Une ligne sous le nom : ce qui part au nom de la page et ce qui reste personnel. */
  note?: string;
}) {
  return (
    <div className="cas-line" data-testid={testId}>
      <span className="cas-line__logo" aria-hidden="true">
        {casquette.logoUrl ? <img src={casquette.logoUrl} alt="" /> : <span>{initialsOf(casquette.name)}</span>}
      </span>
      <p className="cas-line__text">
        <small className="o-t-credit">{intro}</small>
        <strong className="cas-line__name" data-testid={`${testId}-name`}>
          {casquette.name}
        </strong>
        {note ? (
          <small className="o-t-caption s-muted" data-testid={`${testId}-note`}>
            {note}
          </small>
        ) : null}
      </p>
      <Button
        variant="secondary"
        icon={action.icon}
        href={action.href}
        aria-label={action.hint}
        data-testid={`${testId}-change`}
        className="cas-line__change"
      >
        {action.label}
      </Button>
    </div>
  );
}
