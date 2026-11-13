// La sous-navigation de la casquette média ou prestataire (lot R9h, T52) : la pastille de la page (logo, nom jamais tronqué) et la rangée
// d'onglets collante `UnderTabs`, les mêmes cinq que la barre de l'appli (`tabSets` du système de design : le libellé, l'icône) :
// média « Explorer · Le Fil · Accueil · Presse · Page », prestataire « Missions · Le Fil · Accueil · Candidatures · Page ». L'actif se
// lit dans l'adresse (les ancres `#…` des sections de la vitrine, côté navigateur seulement).
import { initialsOf, tabSets } from "@orasso/design-system/web";
import { casquettesLabels as C } from "@orasso/shared";
import { useLocation } from "react-router";

import "../../styles/casquette.css";
import type { Casquette } from "../../lib/actor";
import { UnderTabs } from "../UnderTabs";

export type CasquetteTabsSpace = "media" | "provider";

type TabId = string;

/** Où mène chaque onglet, par espace. Les onglets qui n'ont pas de route propre ouvrent la section de l'écran existant. */
const HREFS: Record<CasquetteTabsSpace, Record<TabId, string>> = {
  media: {
    explore: "/app/media?onglet=explorer",
    feed: "/app/media/fil",
    home: "/app/media",
    press: "/app/media?onglet=presse",
    page: "/app/media/page",
  },
  provider: {
    missions: "/app/prestataire#pr-missions",
    feed: "/app/prestataire/fil",
    home: "/app/prestataire",
    applications: "/app/prestataire#mes-candidatures",
    page: "/app/prestataire/page",
  },
};

/** L'onglet actif d'après l'adresse (chemin, `?onglet=`, ancre). */
export function activeCasquetteTab(space: CasquetteTabsSpace, pathname: string, search: string, hash: string): TabId {
  const base = space === "media" ? "/app/media" : "/app/prestataire";
  if (pathname.startsWith(`${base}/fil`)) return "feed";
  if (pathname.startsWith(`${base}/page`)) return "page";
  if (space === "media") {
    const tab = new URLSearchParams(search).get("onglet");
    if (tab === "explorer") return "explore";
    if (tab === "presse") return "press";
    return "home";
  }
  if (hash === "#pr-missions") return "missions";
  if (hash === "#mes-candidatures") return "applications";
  return "home";
}

export function CasquetteTabs({ space, casquette }: { space: CasquetteTabsSpace; casquette: Casquette }) {
  const { pathname, search, hash } = useLocation();
  const tabs = tabSets[space === "media" ? "media" : "provider"];
  const value = activeCasquetteTab(space, pathname, search, hash);
  return (
    <div className="cas-tabs" data-testid="casquette-tabs-wrap">
      <a className="cas-tabs__who" href={HREFS[space].page} data-testid="casquette-chip">
        <span className="cas-line__logo" aria-hidden="true">
          {casquette.logoUrl ? <img src={casquette.logoUrl} alt="" /> : <span>{initialsOf(casquette.name)}</span>}
        </span>
        <strong className="cas-line__name">{casquette.name}</strong>
      </a>
      <UnderTabs
        value={value}
        items={tabs.map((t) => ({ id: t.id as string, label: t.label, icon: t.icon, href: HREFS[space][t.id] ?? "#" }))}
        label={C.siteNav(casquette.name)}
        testId="casquette-tabs"
        itemTestId={(id) => `casquette-tab-${id}`}
        sticky
      />
    </div>
  );
}
