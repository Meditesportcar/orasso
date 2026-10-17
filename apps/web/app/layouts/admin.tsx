import { Ground, Monogram } from "@orasso/design-system/web";
import { type AdminOverview, devClockLabels, adminNavLabels as N } from "@orasso/shared";
import { Form, Outlet, redirect, useLocation } from "react-router";

import { ThemeSwitch } from "../components/SiteChrome";
import { TwoFactorNotice } from "../components/TwoFactorNotice";
import { requireModeration } from "../lib/admin.server";
import { api } from "../lib/api.server";
import { devClockEnabled } from "../lib/clock.server";
import type { Route } from "./+types/admin";
import "../styles/admin.css";

// Administration (lot 33) : barre latérale de toutes les pages, compteur des files (accueil `GET /admin/overview`),
// thème de l'utilisateur (Béton, Sable ou automatique, comme le reste du compte ; la barre porte le sélecteur). Une page
// = une route enfant (`routes.admin.ts`) et une ligne dans `adminSections`. Le modérateur ne voit que la file des
// signalements (docs/02) ; chaque autre page reste gardée par `requireSuperAdmin` dans son propre loader.
type AdminSection = { href: string; label: string; count?: keyof AdminOverview; moderator?: boolean };

const adminSections: AdminSection[] = [
  { href: "/admin", label: N.overview },
  { href: "/admin/verification", label: N.verification, count: "structuresPending" },
  { href: "/admin/signalements", label: N.reports, count: "reportsPending", moderator: true },
  { href: "/admin/sanctions", label: N.sanctions, count: "sanctionsContested" },
  { href: "/admin/certifications", label: N.certifications, count: "certificationsPending" },
  { href: "/admin/transferts", label: N.transfers, count: "plateTransfersArbitrated" },
  { href: "/admin/contestations", label: N.contests, count: "malusContestsEscalated" },
  { href: "/admin/assistance", label: N.assistance, count: "assistanceOpen" },
  { href: "/admin/utilisateurs", label: N.users },
  { href: "/admin/structures", label: N.structures },
  { href: "/admin/badges", label: N.badges, count: "badgesExpiring" },
  { href: "/admin/pros", label: N.pros, count: "prosToVerify" },
  { href: "/admin/vehicules", label: N.vehicles, count: "otherVehicles" },
  { href: "/admin/journal", label: N.audit },
  { href: "/admin/reglages", label: N.settings },
  { href: "/admin/newsletter", label: N.newsletter, count: "newslettersScheduled" },
  { href: "/admin/sponsorises", label: N.sponsored },
];

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireModeration(request);
  const moderator = me.profile.platformRole === "moderator";
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  if (moderator && path !== "/admin/signalements") throw redirect("/admin/signalements");
  // Compteurs de la barre (super admin) : facultatifs, la page s'affiche sans eux.
  const overview = moderator ? null : await api<AdminOverview>(request, "/admin/overview");
  return {
    pseudo: me.profile.pseudo,
    twoFactorHint: me.twoFactorHint,
    moderator,
    counts: overview?.ok ? overview.data : null,
    devClock: !moderator && devClockEnabled(),
  };
}

export function meta() {
  return [{ title: "Administration · Orasso" }, { name: "robots", content: "noindex, nofollow" }];
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const { pseudo, twoFactorHint, moderator, counts, devClock } = loaderData;
  // Lot 34a : le lien de l'horloge simulée n'existe que si DEV_CLOCK est posée (et pour le super admin).
  const sections: AdminSection[] = devClock
    ? [...adminSections, { href: "/admin/horloge", label: devClockLabels.navLink }]
    : adminSections;
  const { pathname } = useLocation();
  return (
    <Ground variant="site" fixed>
      <div className="orga">
        <nav className="orga__side" aria-label="Administration">
          <div className="orga__brand">
            <Monogram size={32} />
          </div>
          <div className="orga__who">
            <span className="o-t-label">{moderator ? "Modération" : "Administration"}</span>
          </div>
          {sections
            .filter((s) => !moderator || s.moderator)
            .map((s) => {
              const on =
                s.href === "/admin" ? pathname === "/admin" || pathname === "/admin/" : pathname.startsWith(s.href);
              const n = s.count && counts ? counts[s.count] : 0;
              return (
                <a
                  key={s.href}
                  className={on ? "orga__link is-on" : "orga__link"}
                  href={s.href}
                  aria-current={on ? "page" : undefined}
                >
                  {s.label}
                  {n ? ` · ${n}` : ""}
                </a>
              );
            })}
          <div className="orga__spacer" />
          <div className="orga__theme">
            <ThemeSwitch />
          </div>
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
          <TwoFactorNotice hint={twoFactorHint} space="l'administration" />
          <Outlet />
        </main>
      </div>
    </Ground>
  );
}
