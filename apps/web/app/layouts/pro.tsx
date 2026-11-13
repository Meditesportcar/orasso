import { Ground, Monogram } from "@orasso/design-system/web";
import { casquettesLabels, type InboxSummary, navLabels, proVisibility, topBarCounts } from "@orasso/shared";
import { Form, Outlet, redirect, useLocation } from "react-router";
import { CasquetteBar, loadCounts, useLiveCounts } from "../components/casquette/CasquetteBar";
import { ActorProvider } from "../lib/actor";
import { api, requireMe } from "../lib/api.server";
import { now as clockNow } from "../lib/clock";
import { useAnnounceSession } from "../lib/sessionChannel";
import type { Route } from "./+types/pro";

// Espace pro (`/pro/<slug>`, docs/02) : fiche, publications, statistiques, abonnement. Outil de gestion en barre
// latérale, Sable imposé comme l'espace organisateur. Réservé au propriétaire de la fiche.
export async function loader({ request, params }: Route.LoaderArgs) {
  const me = await requireMe(request);
  if (!me.pro) throw redirect("/app/pro/nouvelle");
  if (me.pro.slug !== params.pro) throw redirect(`/pro/${me.pro.slug}`);
  // Lot R9h (T53) : la cloche et la bulle de la personne (pas de celles d'une page : un pro n'en a pas), comme la barre de l'appli.
  const summary = await api<InboxSummary>(request, "/me/inbox/summary");
  // « Fiche de base » après le 21/06/2027 sans abonnement actif : bandeau d'explication (lot 21).
  return {
    userId: me.user.id,
    pro: me.pro,
    // Lot R9h (T48) : la casquette de l'espace est la fiche du paramètre (`p:<id>`), portée par l'espace.
    casquette: { key: `p:${me.pro.id}`, name: me.pro.name, logoUrl: me.pro.logoUrl },
    counts: topBarCounts(summary.ok ? summary.data : null),
    pseudo: me.profile.pseudo,
    banner: proVisibility(me.pro, null, clockNow()).banner,
  };
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
  const { pro, pseudo, banner, casquette } = loaderData;
  useAnnounceSession(loaderData.userId);
  const counts = useLiveCounts(
    loaderData.userId,
    loaderData.counts,
    () => loadCounts<InboxSummary>("/me/inbox/summary", topBarCounts),
    pro.id,
  );
  const { pathname } = useLocation();
  const base = `/pro/${pro.slug}`;
  return (
    // Lot 38 (DA v2, H2) : le thème n'est plus imposé (Sable) ; il suit le choix de l'utilisateur, Béton par défaut.
    <Ground variant="site" fixed>
      <ActorProvider casquette={casquette}>
        <div className="orga">
          <nav className="orga__side" aria-label="Espace pro" data-bar>
            <div className="orga__brand">
              <Monogram size={32} />
            </div>
            <div className="orga__who">
              <span className="o-t-label">{pro.name}</span>
            </div>
            <SideLink href={base} on={pathname === base}>
              Fiche
            </SideLink>
            <SideLink href={`${base}/fil`} on={pathname.startsWith(`${base}/fil`)}>
              {navLabels.fil.title}
            </SideLink>
            <SideLink href={`${base}/page`} on={pathname.startsWith(`${base}/page`)}>
              {casquettesLabels.pageTitle}
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
            <a className="orga__link" href="/app/sorties">
              Mon compte · {pseudo}
            </a>
            <Form method="post" action="/deconnexion">
              <button type="submit" className="orga__link s-linkbutton">
                Déconnexion
              </button>
            </Form>
          </nav>
          <div className="orga__col">
            <CasquetteBar
              name={pro.name}
              logoUrl={pro.logoUrl}
              pageHref={`${base}/page`}
              counts={counts}
              activityHref="/app/activite"
              messagesHref="/app/messages"
              activityOn={false}
              messagesOn={false}
            />
            <main className="orga__content">
              {banner && (
                <p className="s-notice" role="status" data-testid="basic-sheet-banner">
                  {banner}
                </p>
              )}
              <Outlet />
            </main>
          </div>
        </div>
      </ActorProvider>
    </Ground>
  );
}
