import { Ground, Monogram, ThemeScope } from "@orasso/design-system/web";
import { Outlet, useLocation } from "react-router";

import { requireSuperAdmin } from "../lib/admin.server";
import type { Route } from "./+types/admin";

// Administration (super admin seulement), Sable imposé comme les autres outils de gestion. Une page = une route
// enfant (`routes.admin.ts`) et une ligne dans `adminSections` (lot 15, anti-conflits). Le compteur de chaque entrée
// (files à traiter) viendra avec les chantiers concernés.
type AdminSection = { href: string; label: string; count?: number };

const adminSections: AdminSection[] = [{ href: "/admin", label: "Structures à vérifier" }];

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireSuperAdmin(request);
  return { pseudo: me.profile.pseudo, twoFactorRequired: me.twoFactorRequired };
}

export function meta() {
  return [{ title: "Administration · Orasso" }, { name: "robots", content: "noindex, nofollow" }];
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const { pseudo, twoFactorRequired } = loaderData;
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
              <span className="o-t-label">Administration</span>
            </div>
            {adminSections.map((s) => {
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
            {twoFactorRequired && (
              <p className="s-notice s-notice--alert">
                La double authentification est obligatoire pour l'administration.{" "}
                <a href="/app/securite">Active-la maintenant</a>.
              </p>
            )}
            <Outlet />
          </main>
        </div>
      </Ground>
    </ThemeScope>
  );
}
