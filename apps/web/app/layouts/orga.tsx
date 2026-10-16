import { Ground, Monogram, ThemeScope } from "@orasso/design-system/web";
import type { StructurePublic } from "@orasso/shared";
import { Form, Outlet, useLocation, useParams } from "react-router";

import { apiOrThrow, requireMe } from "../lib/api.server";
import type { Route } from "./+types/orga";

// Espace organisateur : Sable imposé (docs/03), barre latérale, réservé aux membres de la structure.
export async function loader({ request, params }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const membership = me.memberships.find((m) => m.structureSlug === params.structure && m.status === "active");
  if (!membership) throw new Response("Cet espace est réservé aux membres de la structure.", { status: 403 });
  const structure = await apiOrThrow<StructurePublic>(
    request,
    `/structures/by-slug/${encodeURIComponent(params.structure)}`,
  );
  return {
    structure: { id: structure.id, slug: structure.slug, name: structure.name, logoUrl: structure.logoUrl },
    role: membership.role,
    canDecide: membership.role !== "staff" || membership.canDecide,
    isOrganizer: membership.role !== "staff",
    canCheckTickets:
      membership.role !== "staff" || membership.staffRoles.some((r) => r === "scan" || r === "super_staff"),
    twoFactorRequired: me.twoFactorRequired,
    pseudo: me.profile.pseudo,
  };
}

export function meta() {
  return [{ title: "Espace organisateur · Orasso" }, { name: "robots", content: "noindex" }];
}

function SideLink({ href, children, on }: { href: string; children: string; on: boolean }) {
  return (
    <a className={on ? "orga__link is-on" : "orga__link"} href={href} aria-current={on ? "page" : undefined}>
      {children}
    </a>
  );
}

export default function OrgaLayout({ loaderData }: Route.ComponentProps) {
  const { structure, isOrganizer, canCheckTickets, twoFactorRequired, pseudo } = loaderData;
  const { pathname } = useLocation();
  const { eventId } = useParams();
  const base = `/orga/${structure.slug}`;
  const eventBase = eventId ? `${base}/e/${eventId}` : null;
  return (
    <ThemeScope theme="sable">
      <Ground variant="site" fixed>
        <div className="orga">
          <nav className="orga__side" aria-label="Espace organisateur">
            <div className="orga__brand">
              <Monogram size={32} />
            </div>
            <div className="orga__who">
              <span className="o-t-label">{structure.name}</span>
            </div>
            <SideLink href={base} on={pathname === base || pathname.startsWith(`${base}/nouvel-evenement`)}>
              Événements
            </SideLink>
            {eventBase && isOrganizer && (
              <SideLink href={eventBase} on={pathname === eventBase || pathname.startsWith(`${eventBase}/modifier`)}>
                Cet événement
              </SideLink>
            )}
            {eventBase && isOrganizer && (
              <SideLink href={`${eventBase}/candidatures`} on={pathname.startsWith(`${eventBase}/candidatures`)}>
                Candidatures
              </SideLink>
            )}
            {eventBase && (
              <SideLink href={`${eventBase}/jour-j`} on={pathname.startsWith(`${eventBase}/jour-j`)}>
                Jour J et après
              </SideLink>
            )}
            {eventBase && canCheckTickets && (
              <SideLink href={`${eventBase}/billets`} on={pathname.startsWith(`${eventBase}/billets`)}>
                Billets
              </SideLink>
            )}
            {isOrganizer && (
              <SideLink href={`${base}/structure`} on={pathname.startsWith(`${base}/structure`)}>
                Structure
              </SideLink>
            )}
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
            {twoFactorRequired && (
              <p className="s-notice s-notice--alert">
                La double authentification est obligatoire pour l'espace organisateur.{" "}
                <a href="/app/securite">Active-la maintenant</a> pour décider des candidatures.
              </p>
            )}
            <Outlet />
          </main>
        </div>
      </Ground>
    </ThemeScope>
  );
}
