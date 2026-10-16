import { AppBarAction, Ground, Icon, TabBar, type TabItem, tabSets } from "@orasso/design-system/web";
import { explorerLabels, SEARCH_MAX_LENGTH, SEARCH_MIN_LENGTH } from "@orasso/shared";
import { Form, Outlet, useLocation } from "react-router";

import { SiteHeader, ThemeSwitch } from "../components/SiteChrome";
import { requireMe } from "../lib/api.server";
import type { Route } from "./+types/app";

// Espace connecté : mêmes sections que l'appli (Accueil, Explorer, Accès, Garage, Boîte).
export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  return {
    pseudo: me.profile.pseudo,
    orga: me.memberships.find((m) => m.status === "active")?.structureSlug ?? null,
    pro: me.pro?.slug ?? null,
    provider: me.personas.some((p) => p.kind === "provider"),
    unread: me.counts.unreadNotifications,
    emailVerified: me.user.emailVerified,
  };
}

const HREFS: Record<string, string> = {
  home: "/app",
  explore: "/app/explorer",
  access: "/app/acces",
  garage: "/app/garage",
  inbox: "/app/boite",
};

function activeTab(pathname: string): string {
  const hit = Object.entries(HREFS).find(([id, href]) => id !== "home" && pathname.startsWith(href));
  return hit ? hit[0] : "home";
}

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  const { pathname } = useLocation();
  const tabs: TabItem[] = tabSets.fan.map((tab) => ({ ...tab, href: HREFS[tab.id] }));
  return (
    <Ground variant="site" animated fixed>
      <div className="app">
        <SiteHeader>
          {loaderData.orga && <a href={`/orga/${loaderData.orga}`}>Organisateur</a>}
          {loaderData.pro && <a href={`/pro/${loaderData.pro}`}>Pro</a>}
          {loaderData.provider && <a href="/app/prestataire">Prestataire</a>}
          {/* Recherche de premier niveau (lot 29) : renvoie vers l'Explorer, résultats groupés. */}
          <search className="s-search" data-testid="site-search">
            <form action="/app/explorer" method="get" className="s-search__form">
              <label className="o-visually-hidden" htmlFor="site-search-input">
                {explorerLabels.searchTitle}
              </label>
              <input
                id="site-search-input"
                className="s-search__input o-t-meta"
                type="search"
                name="q"
                placeholder={explorerLabels.searchTitle}
                minLength={SEARCH_MIN_LENGTH}
                maxLength={SEARCH_MAX_LENGTH}
                autoComplete="off"
                required
              />
              <button type="submit" className="s-search__submit" aria-label={explorerLabels.searchTitle}>
                <Icon name="search" size={18} />
              </button>
            </form>
          </search>
          {/* Journal (lot 17) : la cloche et sa pastille d'éléments non lus. */}
          <span className="s-bell">
            <AppBarAction icon="bell" label="Journal" href="/app/journal" on={pathname === "/app/journal"} />
            {loaderData.unread > 0 && (
              <span className="s-bell__count o-t-credit" data-testid="bell-count">
                {loaderData.unread}
                <span className="o-visually-hidden"> non lus</span>
              </span>
            )}
          </span>
          <a href="/app/moi">{loaderData.pseudo}</a>
          <Form method="post" action="/deconnexion">
            <button type="submit" className="s-linkbutton o-t-button">
              Déconnexion
            </button>
          </Form>
        </SiteHeader>
        <div className="app__body">
          {!loaderData.emailVerified && (
            <Form method="post" action="/app/moi" className="s-notice s-row s-row--between" data-testid="verify-banner">
              <span>Vérifie ton e-mail : un lien de confirmation t'a été envoyé à l'inscription.</span>
              <input type="hidden" name="intent" value="resend" />
              <button type="submit" className="s-linkbutton o-t-button">
                Renvoyer
              </button>
            </Form>
          )}
          <Outlet />
          <div className="app__theme">
            <ThemeSwitch />
          </div>
        </div>
        <div className="app__tabs">
          <TabBar tabs={tabs} active={activeTab(pathname)} aria-label="Mon compte" />
        </div>
      </div>
    </Ground>
  );
}
