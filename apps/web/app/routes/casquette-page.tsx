import type {
  AlbumsList,
  EventCard,
  MediaPage,
  Page,
  ProCard,
  ProPublic,
  ProviderPage,
  StructureOrganizer,
  StructurePublic,
  WithPageExtras,
} from "@orasso/shared";
import {
  EVENTS_CURSOR_PARAM,
  explicitPageFilter,
  PAGE_FILTER_PARAM,
  PAGE_TAB_PARAM,
  pagePublicationsCount,
  pageShownTab,
  structureEventsPath,
} from "@orasso/shared";
import { redirect } from "react-router";

import { type OwnerData, OwnerPage } from "../components/pages/OwnerPage";
import { api, apiOrThrow, originOf, requireMe } from "../lib/api.server";
import type { Route } from "./+types/casquette-page";

// La « Page » du propriétaire d'une casquette (lot R9h partie 2, T50, maquette R9.3 `n-page`, vue « Le propriétaire »), sur le site :
// `/orga/:structure/page`, `/pro/:pro/page`, `/app/media/page`, `/app/prestataire/page`. Une seule route sous quatre chemins : l'espace
// dit la casquette (T48), la page est la même que celle de l'appli (`OwnerPage`) : le haut compact du Profil (logo dans l'anneau de ses
// stories, nom jamais tronqué, type, **pas** de « Suivre », « QR de la page » et « Réglages » à droite, la bande de trois compteurs, la
// bio), les chips de gestion, les onglets soulignés (`?onglet=`, « Publications » ouvert par défaut quand il y en a), puis « Mes
// casquettes ». Les tableaux de bord d'aujourd'hui restent à leur adresse : la Page s'ajoute, elle ne les remplace pas.
export async function loader({ request, params }: Route.LoaderArgs): Promise<OwnerData> {
  const me = await requireMe(request);
  const url = new URL(request.url);
  const path = url.pathname;
  const origin = originOf(request);
  const raw = url.searchParams.get(PAGE_TAB_PARAM);
  if (path.startsWith("/orga/")) {
    const slug = params.structure ?? "";
    const membership = me.memberships.find((m) => m.structureSlug === slug && m.status === "active");
    // Un simple staff n'a pas la Page de la structure (ni son Fil) : son espace d'aujourd'hui.
    if (!membership || membership.role === "staff") throw redirect(`/orga/${encodeURIComponent(slug)}`);
    const page = await apiOrThrow<WithPageExtras<StructurePublic>>(
      request,
      `/structures/by-slug/${encodeURIComponent(slug)}`,
    );
    // Sans JavaScript, « Voir plus » est un lien : la liste se lit alors à partir du curseur de l'adresse (lot B2b, tour 1).
    const upStart = url.searchParams.get(EVENTS_CURSOR_PARAM.upcoming);
    const pastStart = url.searchParams.get(EVENTS_CURSOR_PARAM.past);
    const [upcoming, past, partners, full] = await Promise.all([
      api<Page<EventCard>>(request, structureEventsPath(page.id, "upcoming", 50, upStart)),
      api<Page<EventCard>>(request, structureEventsPath(page.id, "past", 12, pastStart)),
      api<ProCard[]>(request, `/structures/by-slug/${encodeURIComponent(slug)}/pros`),
      // Le lien d'invitation (staff) : c'est le lien des organisateurs, il est à eux seuls (comme sur la page publique).
      api<StructureOrganizer>(request, `/structures/${page.id}`),
    ]);
    return {
      kind: "organizer",
      origin,
      page,
      slug,
      tab: pageShownTab("structure", {
        raw,
        counts: { publications: pagePublicationsCount(page) },
        session: true,
        owner: true,
      }),
      filter: explicitPageFilter(url.searchParams.get(PAGE_FILTER_PARAM)),
      eventsComplete:
        !upStart && !pastStart && upcoming.ok && past.ok && !upcoming.data.nextCursor && !past.data.nextCursor,
      // Une lecture qui échoue reste `null` : l'écran dit la panne avec « Réessayer », jamais une liste vide ni un « 0 ».
      upcoming: upcoming.ok ? upcoming.data.items : null,
      upcomingNext: upcoming.ok ? upcoming.data.nextCursor : null,
      past: past.ok ? past.data.items : null,
      pastNext: past.ok ? past.data.nextCursor : null,
      partners: partners.ok ? partners.data : null,
      inviteToken: full.ok ? full.data.inviteToken : null,
      // Un refus (403 `two_factor_required`, propriétaire sans second facteur) n'est pas une panne : « Réessayer » n'y changerait rien.
      inviteFailed: !full.ok && full.status >= 500,
    };
  }
  if (path.startsWith("/pro/")) {
    if (!me.pro) throw redirect("/app/pro/nouvelle");
    const page = await apiOrThrow<WithPageExtras<ProPublic>>(
      request,
      `/pros/by-slug/${encodeURIComponent(me.pro.slug)}`,
    );
    return {
      kind: "pro",
      origin,
      page,
      slug: me.pro.slug,
      tab: pageShownTab("pro", {
        raw,
        counts: { publications: pagePublicationsCount(page) },
        session: true,
        owner: true,
      }),
    };
  }
  if (path.startsWith("/app/media")) {
    const persona = me.personas.find((p) => p.kind === "media");
    if (!persona) throw redirect("/app/media");
    const page = await apiOrThrow<WithPageExtras<MediaPage>>(request, `/media/${encodeURIComponent(persona.id)}`);
    const albums = await api<AlbumsList>(request, "/me/albums?limit=20");
    return {
      kind: "media",
      origin,
      page,
      tab: pageShownTab("media", {
        raw,
        counts: { publications: pagePublicationsCount(page) },
        session: true,
        owner: true,
      }),
      albums: albums.ok ? albums.data : null,
    };
  }
  const persona = me.personas.find((p) => p.kind === "provider");
  if (!persona) throw redirect("/app/prestataire");
  const page = await apiOrThrow<WithPageExtras<ProviderPage>>(request, `/providers/${encodeURIComponent(persona.id)}`);
  return {
    kind: "provider",
    origin,
    page,
    tab: pageShownTab("provider", {
      raw,
      counts: { publications: pagePublicationsCount(page) },
      session: true,
      owner: true,
    }),
  };
}

export function meta() {
  return [{ title: "Page · Orasso" }, { name: "robots", content: "noindex" }];
}

export default function CasquettePage({ loaderData }: Route.ComponentProps) {
  // La clé de la page : une page d'une autre casquette ne garde jamais l'état de celle-ci (mentions, listes).
  return <OwnerPage key={`${loaderData.kind}:${loaderData.page.id}`} data={loaderData} />;
}
