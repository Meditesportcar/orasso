// L'onglet « Publications » d'une page (lot R8g, maquettes R8.6 `pageH` et R9.3) : la brique de R8b2 branchée sur la clé de la page.
// Structure : les puces « Tout · Événements · Hors événement » (`filter`) ; état vide « Pas encore de publication » ; jamais de
// bouton « Publier » ici (c'est la vue du propriétaire, livraison 3). Sans session : les publications de la structure en liste
// blanche (`PublicPublications`), ni flamme, ni commentaires, ni menu.
import { Chip, ChipRow } from "@orasso/design-system/native";
import { type AuthorPostsFilter, pagesLabels as L, pageEmptyText, pageFilterLabel, pageFilters } from "@orasso/shared";

import { PublicationsTab } from "@/features/publications/PublicationsTab";
import { PublicPublications } from "./PublicPublications";

export function PagePublications({
  authorKey,
  name,
  withFilter,
  filter,
  onFilter,
  total,
  session,
}: {
  /** `s:<structure>` ou `p:<fiche pro>`. */
  authorKey: string;
  name: string;
  /** Le filtre n'existe que pour une structure. */
  withFilter: boolean;
  filter: AuthorPostsFilter;
  onFilter: (f: AuthorPostsFilter) => void;
  /** Le nombre de publications servi avec la page (la ligne « N publications » du filtre « Tout »). */
  total: number | null;
  session: boolean;
}) {
  if (!session) return <PublicPublications authorKey={authorKey} name={name} />;
  const header = withFilter ? (
    <ChipRow>
      {pageFilters.map((f) => (
        <Chip
          key={f}
          selected={f === filter}
          accessibilityRole="radio"
          accessibilityLabel={`${L.filterGroup} : ${pageFilterLabel(f)}`}
          onPress={() => onFilter(f)}
        >
          {pageFilterLabel(f)}
        </Chip>
      ))}
    </ChipRow>
  ) : undefined;
  return (
    <PublicationsTab
      key={`${authorKey}:${filter}`}
      authorKey={authorKey}
      pseudo={name}
      mine={false}
      total={filter === "all" ? total : null}
      filter={withFilter ? filter : undefined}
      emptyText={pageEmptyText(filter, name)}
      header={header}
    />
  );
}
