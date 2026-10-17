import { Ground, Monogram, ThemeScope } from "@orasso/design-system/web";
import { Outlet, redirect, useLocation } from "react-router";

import { TwoFactorNotice } from "../components/TwoFactorNotice";
import { requireModeration } from "../lib/admin.server";
import type { Route } from "./+types/admin";

// Administration (super admin seulement), Sable imposé comme les autres outils de gestion. Une page = une route
// enfant (`routes.admin.ts`) et une ligne dans `adminSections` (lot 15, anti-conflits). Le compteur de chaque entrée
// (files à traiter) viendra avec les chantiers concernés.
// Lot 32 : le modérateur entre aussi, mais ne voit que la file des signalements (docs/02) ; chaque autre page reste
// gardée par `requireSuperAdmin` dans son propre loader.
type AdminSection = { href: string; label: string; count?: number; moderator?: boolean };

const adminSections: AdminSection[] = [
  { href: "/admin", label: "Structures à vérifier" },
  { href: "/admin/certifications", label: "Certifications" },
  { href: "/admin/transferts", label: "Transferts de plaque" },
  { href: "/admin/signalements", label: "Signalements", moderator: true },
  { href: "/admin/sanctions", label: "Sanctions" },
  { href: "/admin/badges", label: "Badges des structures" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireModeration(request);
  const moderator = me.profile.platformRole === "moderator";
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  if (moderator && path !== "/admin/signalements") throw redirect("/admin/signalements");
  return { pseudo: me.profile.pseudo, twoFactorHint: me.twoFactorHint, moderator };
}

export function meta() {
  return [{ title: "Administration · Orasso" }, { name: "robots", content: "noindex, nofollow" }];
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const { pseudo, twoFactorHint, moderator } = loaderData;
  const { pathname } = useLocation();
  return (
    <ThemeScope theme="sable">
      <Ground variant="site" fixed>
        <div className="orga">
          <nav className="orga__side" aria-label="Administration">
            <div className="orga__brand">
              <Monogram size={32} />
            </div>
            <div className="orga__who">
              <span className="o-t-label">{moderator ? "Modération" : "Administration"}</span>
            </div>
            {adminSections
              .filter((s) => !moderator || s.moderator)
              .map((s) => {
                const on =
                  s.href === "/admin" ? pathname === "/admin" || pathname === "/admin/" : pathname.startsWith(s.href);
                return (
                  <a
                    key={s.href}
                    className={on ? "orga__link is-on" : "orga__link"}
                    href={s.href}
                    aria-current={on ? "page" : undefined}
                  >
                    {s.label}
                    {s.count ? ` · ${s.count}` : ""}
                  </a>
                );
              })}
            <div className="orga__spacer" />
            <a className="orga__link" href="/app/acces">
              Mon compte · {pseudo}
            </a>
          </nav>
          <main className="orga__content">
            <TwoFactorNotice hint={twoFactorHint} space="l'administration" />
            <Outlet />
          </main>
        </div>
      </Ground>
    </ThemeScope>
  );
}
