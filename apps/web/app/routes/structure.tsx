// Page publique d'une structure (`/o/<slug>`), vue d'un visiteur.
// Lot R8g (D40, maquettes R8.6 `pu-publi` et R9.3 `n-page`) : le haut compact du Profil (logo dans l'anneau de ses stories, nom,
// type et vérification, « Suivre », bio sur une ligne, icônes « Message » et « Plus », trois compteurs) puis des onglets soulignés
// et collants lus dans `?onglet=` (un lien partagé ouvre le bon) : « Événements » (ce que la page montrait), « Publications »
// (les siennes, filtre « Tout · Événements · Hors événement » dans `?filtre=`, ouvert par défaut), « Mentions · N » (ceux qui la
// citent). Sans session : « Événements » et « Publications » seulement, en liste blanche, rendues côté serveur ; titres,
// description et balises de partage inchangés.
import { Button, Chip } from "@orasso/design-system/web";
import {
  type AuthorPostsFilter,
  authorKeyOf,
  countFr,
  type EventCard,
  explicitPageFilter,
  pagesLabels as L,
  PAGE_FILTER_PARAM,
  PAGE_TAB_PARAM,
  type Page,
  type ProCard,
  type PublicPostsPage,
  pageCounters,
  pageMentionsCount,
  pagePublicationsCount,
  pageShownTab,
  pageTabs,
  profileRingState,
  type StructureOrganizer,
  type StructurePublic,
  staffRequestLabels,
  structureKindLabels,
  type WithPageExtras,
} from "@orasso/shared";
import { data, Form, redirect } from "react-router";

import { PageHead } from "../components/pages/PageHead";
import { PageMentions } from "../components/pages/PageMentions";
import { PageMore } from "../components/pages/PageMore";
import { PagePublications } from "../components/pages/PagePublications";
import { PageTabs, pageTabHref } from "../components/pages/PageTabs";
import { StructureEvents } from "../components/pages/StructureEvents";
import { SideIcon } from "../components/profile/ProfileHead";
import { ShareButtons } from "../components/ShareButtons";
import { api, apiOrThrow, getMe, loginUrl, originOf } from "../lib/api.server";
import { messageAction } from "../lib/messaging.server";
import type { Route } from "./+types/structure";

export async function loader({ request, params }: Route.LoaderArgs) {
  const slug = params.slug;
  const structure = await apiOrThrow<WithPageExtras<StructurePublic>>(
    request,
    `/structures/by-slug/${encodeURIComponent(slug)}`,
  );
  const [upcoming, past, me, partners] = await Promise.all([
    api<Page<EventCard>>(request, `/events?structureId=${structure.id}&limit=50`),
    api<Page<EventCard>>(request, `/events?structureId=${structure.id}&scope=past&limit=12`),
    getMe(request),
    api<ProCard[]>(request, `/structures/by-slug/${encodeURIComponent(slug)}/pros`),
  ]);
  const organizer = me?.memberships.find(
    (m) => m.structureId === structure.id && m.status === "active" && m.role !== "staff",
  );
  // Lien d'invitation : visible des organisateurs de la structure seulement (c'est leur lien à partager).
  const full = organizer ? await api<StructureOrganizer>(request, `/structures/${structure.id}`) : null;
  // Devenir staff (lot 24) : où en est ma demande ou mon appartenance à cette structure.
  const mine = me?.memberships.find((m) => m.structureId === structure.id);
  // Lot R8g : l'onglet et le filtre se lisent dans l'adresse ; « Publications » s'ouvre par défaut quand la page en a.
  const url = new URL(request.url);
  const session = Boolean(me);
  const tab = pageShownTab("structure", {
    raw: url.searchParams.get(PAGE_TAB_PARAM),
    counts: { publications: pagePublicationsCount(structure) },
    session,
  });
  const filter = explicitPageFilter(url.searchParams.get(PAGE_FILTER_PARAM));
  // Sans session : les publications de la structure (liste blanche, T4), lues par le serveur pour un rendu sans JavaScript.
  const publicFirst =
    !session && tab === "publications"
      ? await api<PublicPostsPage>(
          request,
          `/authors/${encodeURIComponent(authorKeyOf("structure", structure.id))}/feed-posts`,
        )
      : null;
  return {
    staffState: (mine && mine.role === "staff" ? mine.status : null) as "active" | "invited" | "requested" | null,
    structure,
    upcoming: upcoming.ok ? upcoming.data.items : [],
    past: past.ok ? past.data.items : [],
    partners: partners.ok ? partners.data : [],
    connected: session,
    inviteToken: full?.ok ? full.data.inviteToken : null,
    isOrganizer: Boolean(organizer),
    origin: originOf(request),
    tab,
    filter,
    publicFirst: publicFirst?.ok ? publicFirst.data : null,
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: "Structure introuvable · Orasso" }];
  const { structure, origin } = loaderData;
  const where = [structure.city, structure.department].filter(Boolean).join(" ");
  const description =
    structure.description?.slice(0, 160) ||
    `${structureKindLabels[structure.kind]}${where ? ` · ${where}` : ""} · ${countFr(structure.followersCount, "abonné")}. Événements à venir sur Orasso.`;
  const title = `${structure.name} · Orasso`;
  const image = structure.logoUrl ? new URL(structure.logoUrl, origin).toString() : `${origin}/og-image.png`;
  return [
    { title },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Orasso" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: `${origin}/o/${structure.slug}` },
    { property: "og:image", content: image },
    { name: "twitter:card", content: "summary" },
  ];
}

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const structureId = String(form.get("structureId") ?? "");
  if (!(await getMe(request))) throw redirect(loginUrl(request));
  if (structureId && (intent === "follow" || intent === "unfollow")) {
    await api(request, `/structures/${structureId}/follow`, { method: intent === "follow" ? "POST" : "DELETE" });
  }
  // Contacter l'organisateur (lot 18) : toujours possible, conversation avec la structure.
  if (intent === "contact_organizer") return messageAction(request, form);
  // Demande pour devenir staff (lot 24) : l'organisateur est prévenu et répond depuis son espace.
  if (intent === "become_staff" && structureId) {
    const res = await api(request, `/structures/${structureId}/staff-requests`, {
      method: "POST",
      json: { message: String(form.get("message") ?? "").trim() || null },
    });
    if (!res.ok) return data({ staffError: res.error.message }, { status: res.status });
    return redirect(`/o/${params.slug}?staff=demande`);
  }
  return redirect(`/o/${params.slug}`);
}

export default function StructurePage({ loaderData, actionData }: Route.ComponentProps) {
  const {
    structure,
    upcoming,
    past,
    partners,
    connected,
    inviteToken,
    isOrganizer,
    origin,
    staffState,
    tab,
    filter,
    publicFirst,
  } = loaderData;
  const staffError = (actionData as { staffError?: string } | undefined)?.staffError;
  const messageError = (actionData as { messageError?: string | null } | undefined)?.messageError;
  const path = `/o/${structure.slug}`;
  const retour = `/connexion?retour=${encodeURIComponent(path)}`;
  const tabs = pageTabs("structure", { session: connected, mentionsCount: pageMentionsCount(structure) });
  const counters = pageCounters("structure", {
    followers: structure.followersCount,
    events: upcoming.length + past.length,
    partners: partners.length,
  });
  const key = authorKeyOf("structure", structure.id);
  const ring = connected ? profileRingState(structure.stories) : null;
  const eventsHref = pageTabHref(path, "events");
  return (
    <div className="s-stack pg-page">
      <PageHead
        testId="structure-head"
        nameId="so-title"
        name={structure.name}
        logoUrl={structure.logoUrl}
        ring={ring}
        storiesHref={
          connected && (structure.stories?.count ?? 0) > 0 ? `/app/story/${encodeURIComponent(key)}` : undefined
        }
        typeLabel={L.typeStructure}
        verifiedLabel={structure.verified ? L.verifiedStructure : null}
        follow={
          connected ? (
            <Form method="post" className="fl-form">
              <input type="hidden" name="structureId" value={structure.id} />
              <Button
                type="submit"
                name="intent"
                value={structure.isFollowing ? "unfollow" : "follow"}
                variant={structure.isFollowing ? "secondary" : "primary"}
                icon={structure.isFollowing ? "check" : "add"}
                className="fl-line"
                data-testid="follow-button"
              >
                {structure.isFollowing ? L.following : L.follow}
              </Button>
            </Form>
          ) : (
            <Button variant="primary" icon="add" className="fl-line" href={retour} data-testid="follow-button">
              {L.follow}
            </Button>
          )
        }
        bio={structure.description}
        side={
          <>
            {/* « Message » : la conversation avec l'équipe organisatrice (l'ancien « Contacter l'organisateur »). */}
            {structure.verified &&
              !isOrganizer &&
              (connected ? (
                <Form method="post" className="pt-side__form">
                  <input type="hidden" name="intent" value="contact_organizer" />
                  <input type="hidden" name="structureId" value={structure.id} />
                  <SideIcon icon="chat" label={L.message} type="submit" testId="contact-organizer" />
                </Form>
              ) : (
                <SideIcon icon="chat" label={L.message} href={retour} testId="contact-organizer" />
              ))}
            <PageMore>
              <div className="s-stack s-stack--tight">
                <ShareButtons url={`${origin}${path}`} title={`${structure.name} sur Orasso`} />
                {structure.verified && !isOrganizer && (
                  <div className="s-stack s-stack--tight" data-testid="become-staff">
                    {staffState === "active" ? (
                      <Chip variant="accent">Tu fais partie du staff</Chip>
                    ) : staffState === "requested" ? (
                      <Chip>{staffRequestLabels.sent}</Chip>
                    ) : staffState === "invited" ? (
                      <Button variant="secondary" icon="staff" href="/app/activite/demandes" fullWidth>
                        {staffRequestLabels.invited}
                      </Button>
                    ) : connected ? (
                      <Form method="post" className="s-stack s-stack--tight">
                        <input type="hidden" name="structureId" value={structure.id} />
                        <Button
                          type="submit"
                          name="intent"
                          value="become_staff"
                          variant="secondary"
                          icon="staff"
                          fullWidth
                        >
                          {staffRequestLabels.becomeStaff}
                        </Button>
                      </Form>
                    ) : (
                      <Button variant="secondary" icon="staff" href={retour} fullWidth>
                        {staffRequestLabels.becomeStaff}
                      </Button>
                    )}
                    {staffError && (
                      <p className="s-error" role="alert">
                        {staffError}
                      </p>
                    )}
                  </div>
                )}
                {isOrganizer && (
                  <Button variant="secondary" icon="calendar" href={`/orga/${structure.slug}`} fullWidth>
                    Espace organisateur
                  </Button>
                )}
              </div>
            </PageMore>
          </>
        }
        counters={counters}
        counterHref={() => eventsHref}
      />

      {messageError && (
        <p className="s-error" role="alert">
          {messageError}
        </p>
      )}

      <PageTabs value={tab} items={tabs} path={path} />

      {tab === "events" ? (
        <StructureEvents
          structure={structure}
          upcoming={upcoming}
          past={past}
          partners={partners}
          inviteToken={inviteToken}
          origin={origin}
        />
      ) : tab === "publications" ? (
        <PagePublications
          authorKey={key}
          name={structure.name}
          path={path}
          withFilter
          filter={filter as AuthorPostsFilter}
          total={pagePublicationsCount(structure) ?? null}
          session={connected}
          publicFirst={publicFirst}
        />
      ) : (
        <PageMentions pageKey={key} pageName={structure.name} manage={isOrganizer} />
      )}
    </div>
  );
}
