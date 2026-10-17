import { Ground, Monogram, ThemeScope } from "@orasso/design-system/web";
import {
  type AssistanceState,
  afterEventLabels,
  assistanceTexts,
  badgeDaysLeft,
  type StructureOrganizer,
  type StructurePublic,
  type StructureSuspensionReason,
} from "@orasso/shared";
import { Form, Outlet, useLocation, useParams } from "react-router";
import { TwoFactorNotice } from "../components/TwoFactorNotice";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { now as clockNow } from "../lib/clock";
import { formatDay } from "../lib/format";
import type { Route } from "./+types/orga";
import "../styles/admin.css";
import "../styles/after-event.css";

// Espace organisateur : Sable imposé (docs/03), barre latérale, réservé aux membres de la structure.
export async function loader({ request, params }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const membership = me.memberships.find((m) => m.structureSlug === params.structure && m.status === "active");
  if (!membership) throw new Response("Cet espace est réservé aux membres de la structure.", { status: 403 });
  const structure = await apiOrThrow<StructurePublic>(
    request,
    `/structures/by-slug/${encodeURIComponent(params.structure)}`,
  );
  // Lot 27 : badge qui expire (30 jours) ou structure suspendue → bandeau pour les organisateurs.
  let badge:
    | { kind: "expiring"; days: number }
    | { kind: "suspended"; reason: StructureSuspensionReason | null }
    | null = null;
  if (membership.role !== "staff") {
    const organizer = await api<StructureOrganizer>(request, `/structures/${structure.id}`);
    if (organizer.ok) {
      const o = organizer.data;
      if (o.verification === "suspended") badge = { kind: "suspended", reason: o.suspendedReason };
      else if (o.verification === "verified" && o.badgeExpiresAt) {
        const days = badgeDaysLeft(new Date(o.badgeExpiresAt), clockNow());
        if (days <= 30) badge = { kind: "expiring", days };
      }
    }
  }
  // Lot 33 (S41) : super admin en survol → bandeau « lecture seule » ou « intervention en cours (demande du …) ».
  let assistance: { mode: "read_only" | "intervention"; since: string | null } | null = null;
  if (membership.assisted) {
    const state = await api<AssistanceState>(request, `/structures/${structure.id}/assistance`);
    assistance = {
      mode: state.ok && state.data.mode === "intervention" ? "intervention" : "read_only",
      since: state.ok ? (state.data.current?.createdAt ?? null) : null,
    };
  }
  return {
    badge,
    assistance,
    structure: { id: structure.id, slug: structure.slug, name: structure.name, logoUrl: structure.logoUrl },
    role: membership.role,
    canDecide: membership.role !== "staff" || membership.canDecide,
    isOrganizer: membership.role !== "staff",
    canCheckTickets:
      membership.role !== "staff" || membership.staffRoles.some((r) => r === "scan" || r === "super_staff"),
    twoFactorHint: me.twoFactorHint,
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
  const { structure, isOrganizer, canCheckTickets, twoFactorHint, pseudo, badge, assistance } = loaderData;
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
            {eventBase && isOrganizer && (
              <SideLink href={`${eventBase}/apres`} on={pathname.startsWith(`${eventBase}/apres`)}>
                {afterEventLabels.navLink}
              </SideLink>
            )}
            {eventBase && canCheckTickets && (
              <SideLink href={`${eventBase}/billets`} on={pathname.startsWith(`${eventBase}/billets`)}>
                Billets
              </SideLink>
            )}
            <SideLink href={`${base}/communication`} on={pathname.startsWith(`${base}/communication`)}>
              Communication
            </SideLink>
            {isOrganizer && (
              <SideLink href={`${base}/staff`} on={pathname.startsWith(`${base}/staff`)}>
                Staff
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
            <TwoFactorNotice hint={twoFactorHint} space="l'espace organisateur" />
            {assistance && (
              <p
                className={
                  assistance.mode === "intervention" ? "s-notice adm-assist" : "s-notice s-notice--alert adm-assist"
                }
                role="status"
                data-testid="orga-assistance"
                data-mode={assistance.mode}
              >
                <span>
                  <strong>
                    {assistance.mode === "intervention" && assistance.since
                      ? assistanceTexts.intervention(formatDay(assistance.since))
                      : assistanceTexts.readOnly}
                  </strong>{" "}
                  {assistance.mode === "intervention" ? assistanceTexts.interventionHint : assistanceTexts.readOnlyHint}
                </span>
                <a href={`/admin/structures/${structure.id}`}>Fiche dans l'administration</a>
              </p>
            )}
            {badge?.kind === "suspended" && (
              <p className="s-notice s-notice--alert ae-banner" role="alert" data-testid="orga-suspended">
                <span>
                  {badge.reason === "badge_expired"
                    ? afterEventLabels.badgeSuspendedExpired
                    : badge.reason === "moderation"
                      ? afterEventLabels.badgeSuspendedModeration
                      : afterEventLabels.badgeSuspended}
                </span>
                <a href="mailto:contact@orasso.fr">{afterEventLabels.badgeContact}</a>
              </p>
            )}
            {badge?.kind === "expiring" && (
              <p className="s-notice ae-banner" role="status" data-testid="orga-badge-expiring">
                <span>
                  {afterEventLabels.badgeExpiring(badge.days)} {afterEventLabels.badgeExpiringHint}
                </span>
                <a href={`${base}/structure`}>Ouvrir la structure</a>
              </p>
            )}
            <Outlet />
          </main>
        </div>
      </Ground>
    </ThemeScope>
  );
}
