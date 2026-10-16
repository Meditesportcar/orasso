import { Ground } from "@orasso/design-system/web";
import { Outlet, useLocation } from "react-router";

import { SiteFooter, SiteHeader } from "../components/SiteChrome";
import { getMe } from "../lib/api.server";
import type { Route } from "./+types/public";

// Mise en page publique : en-tête avec le logo, pied « Propulsé par Orasso » et pages légales.
export async function loader({ request }: Route.LoaderArgs) {
  const me = await getMe(request);
  return {
    pseudo: me?.profile.pseudo ?? null,
    orga: (me?.memberships ?? []).find((m) => m.status === "active")?.structureSlug ?? null,
    pro: me?.pro?.slug ?? null,
  };
}

export default function PublicLayout({ loaderData }: Route.ComponentProps) {
  const { pathname, search } = useLocation();
  const retour = encodeURIComponent(pathname + search);
  return (
    <Ground variant="site" animated fixed>
      <div className="s-shell">
        <SiteHeader>
          {loaderData.pseudo ? (
            <>
              {loaderData.orga && <a href={`/orga/${loaderData.orga}`}>Organisateur</a>}
              {loaderData.pro && <a href={`/pro/${loaderData.pro}`}>Pro</a>}
              <a href="/app/acces">{loaderData.pseudo}</a>
            </>
          ) : (
            <>
              <a href={`/connexion?retour=${retour}`}>Connexion</a>
              <a href={`/inscription?retour=${retour}`}>Créer un compte</a>
            </>
          )}
        </SiteHeader>
        <main className="s-main">
          <Outlet />
        </main>
        <SiteFooter />
      </div>
    </Ground>
  );
}
