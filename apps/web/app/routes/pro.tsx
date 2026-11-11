// Fiche publique d'un pro (`/p/<slug>`, docs/01 « Professionnels » : logo, activités, adresse ou zone d'intervention,
// horaires, photos de réalisations, contact, réseaux, remises par grade, organisateurs partenaires).
// Lot R8g (D40, maquettes R8.6 `pu-publi` et R9.3 `n-page`) : le haut compact du Profil (logo dans l'anneau de ses stories, nom,
// « Pro » et « Pro vérifié », « Suivre », bio sur une ligne, icônes « Itinéraire » et « Plus », compteurs) puis des onglets
// soulignés et collants lus dans `?onglet=` : « Présentation » (tout le contenu d'hier), « Publications » (les siennes, ouvert par
// défaut quand il y en a), « Mentions · N » (ses collaborations commerciales et ceux qui le citent). Sans session : « Présentation »
// seule (T4). Titres, description, balises de partage et données structurées inchangés.
import { Button } from "@orasso/design-system/web";
import {
  authorKeyOf,
  pagesLabels as L,
  PAGE_TAB_PARAM,
  type ProPublic,
  pageCounters,
  pageMentionsCount,
  pagePublicationsCount,
  pageShownTab,
  pageTabs,
  proActivityLabels,
  profileRingState,
  type WithPageExtras,
} from "@orasso/shared";
import { useEffect, useState } from "react";
import { Form, redirect } from "react-router";

import { PageHead } from "../components/pages/PageHead";
import { PageMentions } from "../components/pages/PageMentions";
import { PageMore } from "../components/pages/PageMore";
import { PagePublications } from "../components/pages/PagePublications";
import { mentionsShown, PageTabs } from "../components/pages/PageTabs";
import { ProPresentation } from "../components/pages/ProPresentation";
import { SideIcon } from "../components/profile/ProfileHead";
import { ReportDialog } from "../components/ReportDialog";
import { apiFetch } from "../lib/api.client";
import { api, apiOrThrow, getMe, loginUrl, originOf } from "../lib/api.server";
import type { Route } from "./+types/pro";

export async function loader({ request, params }: Route.LoaderArgs) {
  const pro = await apiOrThrow<WithPageExtras<ProPublic>>(request, `/pros/by-slug/${encodeURIComponent(params.slug)}`);
  const session = Boolean(await getMe(request));
  // Lot R8g : l'onglet se lit dans l'adresse ; « Publications » s'ouvre par défaut quand la fiche en a (jamais sans session : T4).
  const tab = pageShownTab("pro", {
    raw: new URL(request.url).searchParams.get(PAGE_TAB_PARAM),
    counts: { publications: pagePublicationsCount(pro) },
    session,
  });
  return { pro, connected: session, origin: originOf(request), tab };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: "Pro introuvable · Orasso" }];
  const { pro, origin } = loaderData;
  const where = [pro.city, pro.department].filter(Boolean).join(" ");
  const description =
    pro.description?.slice(0, 160) ||
    `${pro.activities.map((a) => proActivityLabels[a]).join(", ")}${where ? ` · ${where}` : ""} · Pro sur Orasso.`;
  const title = `${pro.name} · Orasso`;
  const image = pro.logoUrl ? new URL(pro.logoUrl, origin).toString() : `${origin}/og-image.png`;
  return [
    { title },
    { name: "description", content: description },
    // Une fiche en brouillon (vue de son propriétaire) ne doit pas être indexée.
    ...(pro.published ? [] : [{ name: "robots", content: "noindex" }]),
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Orasso" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: `${origin}/p/${pro.slug}` },
    { property: "og:image", content: image },
    {
      "script:ld+json": {
        "@context": "https://schema.org",
        "@type": "AutoRepair",
        name: pro.name,
        description,
        image,
        telephone: pro.phone ?? undefined,
        url: pro.website ?? `${origin}/p/${pro.slug}`,
        address:
          pro.city || pro.addressLine
            ? {
                "@type": "PostalAddress",
                streetAddress: pro.addressLine ?? undefined,
                postalCode: pro.postalCode ?? undefined,
                addressLocality: pro.city ?? undefined,
                addressCountry: "FR",
              }
            : undefined,
        geo:
          pro.lat != null && pro.lng != null
            ? { "@type": "GeoCoordinates", latitude: pro.lat, longitude: pro.lng }
            : undefined,
      },
    },
  ];
}

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const proId = String(form.get("proId") ?? "");
  if (!(await getMe(request))) throw redirect(loginUrl(request));
  if (proId && (intent === "follow" || intent === "unfollow")) {
    await api(request, `/pros/${proId}/follow`, { method: intent === "follow" ? "POST" : "DELETE" });
  }
  return redirect(`/p/${params.slug}`);
}

/** Un compteur de la fiche (vue, appel, itinéraire) : silencieux, jamais bloquant. */
function track(slug: string, kind: "view" | "call" | "route") {
  void apiFetch(`/pros/by-slug/${encodeURIComponent(slug)}/track`, { method: "POST", json: { kind } });
}

export default function ProPage({ loaderData }: Route.ComponentProps) {
  const { pro, connected, origin, tab } = loaderData;
  const [mentionsDelta, setMentionsDelta] = useState(0);
  // Le nombre servi fait foi : la correction locale repart de zéro à chaque nombre neuf ou autre page.
  const servedMentions = pageMentionsCount(pro);
  // biome-ignore lint/correctness/useExhaustiveDependencies: seul un nombre servi neuf remet le delta à zéro
  useEffect(() => setMentionsDelta(0), [servedMentions, pro.id]);
  const path = `/p/${pro.slug}`;
  const retour = `/connexion?retour=${encodeURIComponent(path)}`;
  const route =
    pro.lat != null && pro.lng != null
      ? `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=%3B${pro.lat}%2C${pro.lng}`
      : null;
  const tabs = pageTabs("pro", {
    session: connected,
    mentionsCount: mentionsShown(pageMentionsCount(pro), mentionsDelta),
  });
  const counters = pageCounters("pro", {
    followers: pro.followersCount,
    partners: pro.memberPartnersTotal,
    organizers: pro.partners.length,
  });
  const key = authorKeyOf("pro", pro.id);
  const ring = connected ? profileRingState(pro.stories) : null;

  // Une vue par fiche et par session de navigation (les rechargements ne gonflent pas le compteur).
  useEffect(() => {
    try {
      const viewKey = `orasso:pro-view:${pro.slug}`;
      if (sessionStorage.getItem(viewKey)) return;
      sessionStorage.setItem(viewKey, "1");
    } catch {
      // Stockage indisponible : on compte quand même une fois par chargement.
    }
    track(pro.slug, "view");
  }, [pro.slug]);

  return (
    <div className="s-stack pg-page">
      <PageHead
        testId="pro-head"
        nameId="pro-title"
        name={pro.name}
        logoUrl={pro.logoUrl}
        ring={ring}
        storiesHref={connected && (pro.stories?.count ?? 0) > 0 ? `/app/story/${encodeURIComponent(key)}` : undefined}
        typeLabel={L.typePro}
        verifiedLabel={pro.verified ? L.verifiedPro : null}
        follow={
          connected ? (
            <Form method="post" className="fl-form">
              <input type="hidden" name="proId" value={pro.id} />
              <Button
                type="submit"
                name="intent"
                value={pro.isFollowing ? "unfollow" : "follow"}
                variant={pro.isFollowing ? "secondary" : "primary"}
                icon={pro.isFollowing ? "check" : "add"}
                className="fl-line"
                disabled={pro.isOwner}
                data-testid="follow-button"
              >
                {pro.isFollowing ? L.following : L.follow}
              </Button>
            </Form>
          ) : (
            <Button variant="primary" icon="add" className="fl-line" href={retour} data-testid="follow-button">
              {L.follow}
            </Button>
          )
        }
        bio={pro.description}
        side={
          <>
            {route && (
              <SideIcon
                icon="nav"
                label={L.route}
                href={route}
                target="_blank"
                onClick={() => track(pro.slug, "route")}
                testId="route-icon"
              />
            )}
            <PageMore>
              <div className="s-stack s-stack--tight">
                {connected && !pro.isOwner && <ReportDialog look="link" targetType="pro" targetId={pro.id} />}
                {pro.isOwner && (
                  <Button variant="secondary" icon="list" href={`/pro/${pro.slug}`} fullWidth>
                    Mon espace pro
                  </Button>
                )}
              </div>
            </PageMore>
          </>
        }
        counters={counters}
      />

      <PageTabs value={tab} items={tabs} path={path} />

      {tab === "presentation" ? (
        <ProPresentation pro={pro} origin={origin} onTrack={(kind) => track(pro.slug, kind)} />
      ) : tab === "publications" ? (
        <PagePublications
          authorKey={key}
          name={pro.name}
          path={path}
          withFilter={false}
          filter="all"
          total={pagePublicationsCount(pro) ?? null}
          session={connected}
          publicFirst={null}
        />
      ) : (
        <PageMentions
          pageKey={key}
          pageName={pro.name}
          manage={pro.isOwner}
          onHiddenChange={(d) => setMentionsDelta((v) => v + d)}
        />
      )}
    </div>
  );
}
