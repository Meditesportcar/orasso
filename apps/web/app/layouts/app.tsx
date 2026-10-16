import { AppBarAction, Ground, TabBar, type TabItem, tabSets } from "@orasso/design-system/web";
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
          {/* Journal (lot 17) : la cloche et sa pastille d'éléments non lus. */}
          <AppBarAction
            icon="bell"
            label="Journal"
            href="/app/journal"
            count={loaderData.unread}
            on={pathname === "/app/journal"}
          />
          <a href="/app/amis">Amis</a>
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
