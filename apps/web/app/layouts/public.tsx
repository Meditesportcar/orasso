import { Ground } from "@orasso/design-system/web";
import { siteLabels as L } from "@orasso/shared";
import { Outlet, useLocation } from "react-router";

import { SiteFooter, SiteHeader } from "../components/SiteChrome";
import { getMe } from "../lib/api.server";
import type { Route } from "./+types/public";

// Mise en page publique (DA v2, lot 56) : fond de bataille (lampe en Béton, uni en Sable), en-tête avec le logo, pied
// avec la phrase, les colonnes de liens, « Propulsé par Orasso » et les crédits des données.
export async function loader({ request }: Route.LoaderArgs) {
  const me = await getMe(request);
  return {
    pseudo: me?.profile.pseudo ?? null,
    orga: (me?.memberships ?? []).find((m) => m.status === "active")?.structureSlug ?? null,
    pro: me?.pro?.slug ?? null,
  };
}

/** Pages composées en bandes pleine largeur (le conteneur `.w` cadre chaque bande). */
const BLEED = new Set(["/", "/evenements", "/organisateurs", "/professionnels"]);

export default function PublicLayout({ loaderData }: Route.ComponentProps) {
  const { pathname, search } = useLocation();
  const retour = encodeURIComponent(pathname + search);
  return (
    <Ground variant="battle" fixed>
      <div className="s-shell">
        <SiteHeader download>
          {loaderData.pseudo ? (
            <>
              {loaderData.orga && <a href={`/orga/${loaderData.orga}`}>Organisateur</a>}
              {loaderData.pro && <a href={`/pro/${loaderData.pro}`}>Pro</a>}
              <a href="/app/acces">{loaderData.pseudo}</a>
            </>
          ) : (
            <a href={`/connexion?retour=${retour}`}>{L.login}</a>
          )}
        </SiteHeader>
        <main className={`s-main${BLEED.has(pathname) ? " s-main--bleed" : ""}`}>
          <Outlet />
        </main>
        <SiteFooter />
      </div>
    </Ground>
  );
}
