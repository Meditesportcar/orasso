import { AppBar, Ground, Icon, TabBar, type TabItem, tabSets, useTheme } from "@orasso/design-system/web";
import {
  type MyApplication,
  type MyStaffEvent,
  type MyTicket,
  moderationLabels,
  reportReasonLabels,
} from "@orasso/shared";
import { useEffect } from "react";
import { Form, Outlet, useLocation, useMatches, useRevalidator } from "react-router";

import { isFiche } from "../components/FicheBar";
import { ThemeSwitch } from "../components/SiteChrome";
import { api, requireMe } from "../lib/api.server";
import { now } from "../lib/clock";
import { formatDateTime } from "../lib/format";
import { nearAccessOf } from "../lib/near-access";
import { useChannel } from "../lib/useChannel";
import "../styles/moderation.css";
import { AnnounceBanner, announcementOf, useAnnouncements } from "../components/AnnounceBanner";
import type { Route } from "./+types/app";

// Espace connecté (lot C5, artefact DA v2) : la même barre que l'appli, celle de la casquette de base (exposant :
// Explorer · Sorties · Accueil · Garage · Profil ; visiteur : Passeport à la place du Garage), la Boîte et la recherche
// en haut à droite, l'accès flottant au-dessus de la barre. Les casquettes, la déconnexion et le reste vivent dans
// Profil (`/app/moi`) : « chaque fonction à un seul endroit ».
// Lot M7 (deux modes d'affichage, comme l'appli) : une page de navigation a la bande ORASSO et la barre d'onglets (mode
// A) ; une fiche ou un parcours (route qui déclare `handle = ficheHandle`) n'a que son en-tête de fiche (`FicheBar` :
// titre, ✕ qui revient), sans bande, sans barre ni accès flottant (mode B).
export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  // Accès flottant : l'accès le plus proche (J-7 à J+1) parmi mes places retenues (à venir et finies depuis moins d'un
  // jour), mes billets et mes missions staff, comme l'appli. Une lecture qui échoue ne bloque pas l'espace.
  const [upcoming, past, tickets, staff] = await Promise.all([
    api<MyApplication[]>(request, "/me/applications?scope=upcoming"),
    api<MyApplication[]>(request, "/me/applications?scope=past"),
    api<MyTicket[]>(request, "/me/tickets"),
    api<MyStaffEvent[]>(request, "/me/staff-events"),
  ]);
  return {
    userId: me.user.id,
    // La casquette de base décide de la barre : visiteur sans véhicule, exposant sinon (comme l'appli).
    base: me.personas.some((p) => p.kind === "visitor") ? ("visitor" as const) : ("fan" as const),
    // Pastille de la Boîte (lots 18 et C5) : conversations avec du non lu, demandes en attente, notifications non lues.
    unreadInbox: me.unreadInbox + me.counts.unreadNotifications,
    near: nearAccessOf(
      {
        applications: [...(upcoming.ok ? upcoming.data : []), ...(past.ok ? past.data : [])],
        tickets: tickets.ok ? tickets.data : null,
        staff: staff.ok ? staff.data : null,
      },
      now(),
    ),
    emailVerified: me.user.emailVerified,
    // Lot 32 : compte suspendu (lecture seule) : bandeau avec le motif et « Contester ».
    suspension: me.suspension,
    // Lot 38 : thème Automatique au centre du premier département (cookie orasso-dept, Paris sans secteur).
    department: me.profile.departments[0] ?? null,
  };
}

const HREFS: Record<string, string> = {
  home: "/app",
  explore: "/app/explorer",
  outings: "/app/sorties",
  garage: "/app/garage",
  passport: "/app/passeport",
  profile: "/app/moi",
};

/** Onglet actif d'après l'adresse ; la Boîte et le Journal sont une feuille au-dessus de l'écran, sans onglet. */
function activeTab(pathname: string): string {
  if (pathname.startsWith("/app/boite") || pathname.startsWith("/app/journal")) return "";
  if (pathname === "/app") return "home";
  if (/^\/app\/(sorties|acces|billets|vote|recap)(\/|$)/.test(pathname)) return "outings";
  if (pathname.startsWith("/app/explorer")) return "explore";
  if (pathname.startsWith("/app/garage")) return "garage";
  if (pathname.startsWith("/app/passeport")) return "passport";
  return /^\/app\/(moi|securite|sanctions|aide|amis|crews|media|prestataire|structure|pro)(\/|$)/.test(pathname)
    ? "profile"
    : "home";
}

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  const { pathname, search } = useLocation();
  const fiche = isFiche(useMatches());
  const revalidator = useRevalidator();
  const { setDepartment } = useTheme();
  useEffect(() => setDepartment(loaderData.department), [loaderData.department, setDepartment]);
  // Boîte et Journal en direct (lot 18) : un message, une demande ou une notification recharge les compteurs.
  // Lot M6 : une notification reçue s'annonce aussi dans le bandeau (même système que l'appli).
  const announcements = useAnnouncements(loaderData.userId);
  useChannel(`user:${loaderData.userId}`, (m) => {
    if (m.type === "inbox.changed" || m.type === "conversation.updated" || m.type === "notification") {
      revalidator.revalidate();
    }
    if (m.type === "notification") {
      const a = announcementOf(m.payload);
      if (a) announcements.push(a);
    }
  });
  const tabs: TabItem[] = tabSets[loaderData.base === "visitor" ? "visitor" : "exhibitor"].map((tab) => ({
    ...tab,
    href: HREFS[tab.id],
  }));
  // Un onglet absent de la barre de la casquette (Passeport d'un exposant, Garage d'un visiteur) tombe sur Profil.
  const raw = activeTab(pathname);
  const tab = raw === "" || tabs.some((t) => t.id === raw) ? raw : "profile";
  // Lot M5 (retours 30 et 31, comme l'appli) : pas d'accès flottant non plus au Garage ni au Profil ; lot M7 : ni sur une
  // fiche ou un parcours (mode B).
  const near =
    loaderData.near && !fiche && !["home", "outings", "garage", "profile"].includes(tab) ? loaderData.near : null;
  return (
    <Ground variant="site" animated fixed>
      <div className="app">
        {fiche ? null : (
          <AppBar
            kind="tab"
            className="app__bar"
            searchHref="/app/explorer?segment=resultats"
            searchOn={pathname.startsWith("/app/explorer") && /[?&](q=|segment=resultats)/.test(search)}
            inboxHref="/app/journal"
            inboxOn={tab === ""}
            inboxCount={loaderData.unreadInbox}
          />
        )}
        <AnnounceBanner item={announcements.current} onDone={announcements.drop} />
        <div className={fiche ? "app__body app__body--fiche" : near ? "app__body app__body--near" : "app__body"}>          {!loaderData.emailVerified && (
            <Form method="post" action="/app/moi" className="s-notice s-row s-row--between" data-testid="verify-banner">
              <span>Vérifie ton e-mail : un lien de confirmation t'a été envoyé à l'inscription.</span>
              <input type="hidden" name="intent" value="resend" />
              <button type="submit" className="s-linkbutton o-t-button">
                Renvoyer
              </button>
            </Form>
          )}
          {loaderData.suspension && (
            <div className="s-notice mod-banner" role="status" data-testid="suspended-banner">
              <span>
                <strong>{moderationLabels.suspendedUntil(formatDateTime(loaderData.suspension.until))}</strong> ·{" "}
                {moderationLabels.suspendedReason(reportReasonLabels[loaderData.suspension.reason])}
              </span>
              <a className="o-t-button" href="/app/sanctions" data-testid="suspended-contest">
                {loaderData.suspension.canContest ? moderationLabels.contest : moderationLabels.mySanctions}
              </a>
            </div>
          )}
          <Outlet />
          <div className="app__theme">
            <ThemeSwitch />
          </div>
        </div>
        {near && (
          <a className="near" href={near.href} data-testid="near-access">
            <span className="near__day">
              <b className="o-t-label">{near.countdown}</b>
              <small className="o-t-credit">{near.weekday}</small>
            </span>
            <span className="near__text">
              <strong className="o-t-label">{near.title}</strong>
              <span className="o-t-caption">{near.line}</span>
            </span>
            <span className="near__qr o-t-button">
              <Icon name="qr" size={18} />
              QR
            </span>
          </a>
        )}
        {fiche ? null : (
          <div className="app__tabs">
            <TabBar tabs={tabs} active={tab} aria-label="Mon compte" />
          </div>
        )}
      </div>
    </Ground>
  );
}
