// Les onglets soulignés de la page d'une structure et de la fiche d'un pro, sur le site (lot R8g, maquette R9.3) : des liens
// `?onglet=` rendus côté serveur (un lien partagé ouvre le bon onglet), collés sous la barre du haut. Mêmes mots que l'appli.
import type { IconName } from "@orasso/design-system/web";
import { pagesLabels as L, PAGE_TAB_PARAM, type PageTab, type PageTabItem, pageTabSlug } from "@orasso/shared";

import { UnderTabs } from "../UnderTabs";

const ICON: Record<PageTab, IconName> = {
  events: "calendar",
  presentation: "briefcase",
  publications: "gallery",
  offers: "ticket",
  mentions: "bubble",
};

/** L'adresse d'un onglet : le chemin de la page et `?onglet=`. */
export const pageTabHref = (path: string, tab: PageTab): string => `${path}?${PAGE_TAB_PARAM}=${pageTabSlug(tab)}`;

export function PageTabs({ value, items, path }: { value: PageTab; items: readonly PageTabItem[]; path: string }) {
  return (
    <UnderTabs
      value={value}
      label={L.group}
      testId="page-tabs"
      itemTestId={(id) => `page-tab-${id}`}
      sticky
      items={items.map((i) => ({
        id: i.id,
        label: i.label,
        icon: ICON[i.id],
        count: i.count,
        href: pageTabHref(path, i.id),
      }))}
    />
  );
}

/** Le nombre de « Mentions · N » après un masquage (-1) ou une remise (+1) ; inconnu reste inconnu. */
export const mentionsShown = (base: number | undefined, delta: number): number | undefined =>
  base === undefined ? undefined : Math.max(0, base + delta);
