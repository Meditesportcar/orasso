// Le segment « Publication | Story » en haut de « Publier » (lot R9h, T18 de R9n, maquette R9 `publierR9`) : un seul geste « Publier »,
// on bascule d'un écran à l'autre en gardant la casquette (`?auteur=<clé>`). Basculer avec un brouillon demande confirmation.
import { Icon } from "@orasso/design-system/web";
import { casquettesLabels as C } from "@orasso/shared";

import "../../styles/casquette.css";

export function PublishKind({
  current,
  auteur,
  dirty = false,
}: {
  current: "post" | "story";
  /** La clé d'auteur de la casquette (`s:<id>`…) ou `me` : l'écran de l'autre genre la reprend. */
  auteur: string;
  /** Un brouillon est en cours : on confirme avant de l'abandonner. */
  dirty?: boolean;
}) {
  const query = auteur === "me" ? "" : `?auteur=${encodeURIComponent(auteur)}`;
  const items = [
    { id: "post" as const, label: C.publishKindPost, icon: "gallery" as const, href: `/app/fil/publier${query}` },
    { id: "story" as const, label: C.publishKindStory, icon: "camera" as const, href: `/app/story/publier${query}` },
  ];
  return (
    <div className="cas-kind" role="tablist" aria-label={C.publishKindLabel} data-testid="publish-kind">
      {items.map((it) => (
        <a
          key={it.id}
          href={it.href}
          role="tab"
          aria-selected={it.id === current}
          aria-current={it.id === current ? "page" : undefined}
          className={it.id === current ? "cas-kind__tab is-on" : "cas-kind__tab"}
          data-testid={`publish-kind-${it.id}`}
          onClick={(e) => {
            if (it.id === current) return e.preventDefault();
            if (dirty && !window.confirm(`${C.switchTitle} ${C.switchBody}`)) e.preventDefault();
          }}
        >
          <Icon name={it.icon} size={16} />
          <span>{it.label}</span>
        </a>
      ))}
    </div>
  );
}
