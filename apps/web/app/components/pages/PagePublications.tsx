// L'onglet « Publications » d'une page, sur le site (lot R8g, maquettes R8.6 `pageH` et R9.3) : la brique de R8b2 branchée sur la
// clé de la page. Structure : les puces « Tout · Événements · Hors événement » (des liens `?filtre=`, rendus côté serveur) ; état vide
// « Pas encore de publication » ; jamais de bouton « Publier » ici. Sans session : les publications de la structure en liste
// blanche, rendues côté serveur (`PublicPublications`).
import { Chip } from "@orasso/design-system/web";
import {
  type AuthorPostsFilter,
  pagesLabels as L,
  PAGE_FILTER_PARAM,
  PAGE_TAB_PARAM,
  type PublicPostsPage,
  pageEmptyText,
  pageFilterLabel,
  pageFilterSlug,
  pageFilters,
  pageTabSlug,
} from "@orasso/shared";

import "../../styles/pages.css";
import { PublicationsTab } from "../publications/PublicationsTab";
import { PublicPublications } from "./PublicPublications";

/** L'adresse d'un filtre : « Tout » n'a pas de paramètre. */
const filterHref = (path: string, f: AuthorPostsFilter) =>
  `${path}?${PAGE_TAB_PARAM}=${pageTabSlug("publications")}${f === "all" ? "" : `&${PAGE_FILTER_PARAM}=${pageFilterSlug(f)}`}`;

export function PagePublications({
  authorKey,
  name,
  path,
  withFilter,
  filter,
  total,
  session,
  publicFirst,
  publishAs,
}: {
  /** `s:<structure>` ou `p:<fiche pro>`. */
  authorKey: string;
  name: string;
  /** Le chemin de la page (`/o/<slug>`), pour les adresses des puces. */
  path: string;
  /** Le filtre n'existe que pour une structure. */
  withFilter: boolean;
  filter: AuthorPostsFilter;
  /** Le nombre de publications servi avec la page (la ligne « N publications » du filtre « Tout »). */
  total: number | null;
  session: boolean;
  /** Sans session : la première page lue par le serveur. */
  publicFirst: PublicPostsPage | null;
  /** Lot R9h (partie 2) : la Page du propriétaire : sa clé d'auteur (« Publier » ouvre `/app/fil/publier?auteur=<clé>`). */
  publishAs?: string;
}) {
  if (!session) return <PublicPublications key={authorKey} authorKey={authorKey} name={name} first={publicFirst} />;
  const header = withFilter ? (
    <nav className="pg-filter" aria-label={L.filterGroup} data-testid="page-filter">
      {pageFilters.map((f) => (
        <a
          key={f}
          href={filterHref(path, f)}
          aria-current={f === filter ? "true" : undefined}
          data-testid={`page-filter-${f}`}
        >
          <Chip selected={f === filter}>{pageFilterLabel(f)}</Chip>
        </a>
      ))}
    </nav>
  ) : undefined;
  return (
    <PublicationsTab
      key={`${authorKey}:${filter}`}
      authorKey={authorKey}
      pseudo={name}
      mine={false}
      total={filter === "all" ? total : null}
      filter={withFilter ? filter : undefined}
      emptyText={publishAs && filter === "all" ? L.ownEmptyText : pageEmptyText(filter, name)}
      publishAs={publishAs}
      header={header}
    />
  );
}
