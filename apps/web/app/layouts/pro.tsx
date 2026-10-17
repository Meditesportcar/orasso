import { Ground, Monogram, ThemeScope } from "@orasso/design-system/web";
import { proVisibility } from "@orasso/shared";
import { Form, Outlet, redirect, useLocation } from "react-router";
import { requireMe } from "../lib/api.server";
import { now as clockNow } from "../lib/clock";
import type { Route } from "./+types/pro";

// Espace pro (`/pro/<slug>`, docs/02) : fiche, publications, statistiques, abonnement. Outil de gestion en barre
// latérale, Sable imposé comme l'espace organisateur. Réservé au propriétaire de la fiche.
export async function loader({ request, params }: Route.LoaderArgs) {
  const me = await requireMe(request);
  if (!me.pro) throw redirect("/app/pro/nouvelle");
  if (me.pro.slug !== params.pro) throw redirect(`/pro/${me.pro.slug}`);
  // « Fiche de base » après le 21/06/2027 sans abonnement actif : bandeau d'explication (lot 21).
  return { pro: me.pro, pseudo: me.profile.pseudo, banner: proVisibility(me.pro, null, clockNow()).banner };
}

export function meta() {
  return [{ title: "Espace pro · Orasso" }, { name: "robots", content: "noindex" }];
}

function SideLink({ href, children, on }: { href: string; children: string; on: boolean }) {
  return (
    <a className={on ? "orga__link is-on" : "orga__link"} href={href} aria-current={on ? "page" : undefined}>
      {children}
    </a>
  );
}

export default function ProLayout({ loaderData }: Route.ComponentProps) {
  const { pro, pseudo, banner } = loaderData;
  const { pathname } = useLocation();
  const base = `/pro/${pro.slug}`;
  return (
    <ThemeScope theme="sable">
      <Ground variant="site" fixed>
        <div className="orga">
          <nav className="orga__side" aria-label="Espace pro">
            <div className="orga__brand">
              <Monogram size={32} />
            </div>
            <div className="orga__who">
              <span className="o-t-label">{pro.name}</span>
            </div>
            <SideLink href={base} on={pathname === base}>
              Fiche
            </SideLink>
            <SideLink href={`${base}/publications`} on={pathname.startsWith(`${base}/publications`)}>
              Publications
            </SideLink>
            <SideLink href={`${base}/statistiques`} on={pathname.startsWith(`${base}/statistiques`)}>
              Statistiques
            </SideLink>
            <SideLink href={`${base}/abonnement`} on={pathname.startsWith(`${base}/abonnement`)}>
              Abonnement
            </SideLink>
            <a className="orga__link" href={`/p/${pro.slug}`}>
              Ma fiche publique
            </a>
            <div className="orga__spacer" />
            <a className="orga__link" href="/app/acces">
              Mon compte · {pseudo}
            </a>
            <Form method="post" action="/deconnexion">
              <button type="submit" className="orga__link s-linkbutton">
                Déconnexion
              </button>
            </Form>
          </nav>
          <main className="orga__content">
            {banner && (
              <p className="s-notice" role="status" data-testid="basic-sheet-banner">
                {banner}
              </p>
            )}
            <Outlet />
          </main>
        </div>
      </Ground>
    </ThemeScope>
  );
}
