// La page d'un prestataire (`/providers/<id>`) vue par un connecté (lot 57, `s-vitrine` ; lot R9h partie 2, T54, maquette R9.3 `n-page`, vue
// « Un visiteur »), au gabarit de la page d'une structure et de la fiche d'un pro (R8g) : le logo dans l'anneau de ses stories, le nom
// (jamais tronqué), le type, « Suivre » (le seul bouton principal) ou « Suivi », la bio sur une ligne, « Plus » (Partager, Signaler,
// « Modifier » pour son propriétaire), la bande de compteurs « abonnés · missions · organisateurs » ; puis « Publications » (ouvert par
// défaut quand il y en a), « Prestations » (la vitrine d'aujourd'hui : métier, menu, besoins, zone, avis) et « Mentions · N ».
// « Suivre » écrit l'abonnement de la casquette portée par l'adresse (`?auteur=`, T48) : vu depuis l'espace d'une casquette, c'est la page
// qui suit (T6 et T14). `GET /providers/:id` est réservé aux connectés (lot 46).
import {
  authorKeyOf,
  pagesLabels as L,
  proV2Labels as P,
  PAGE_TAB_PARAM,
  type PageFollowResult,
  type ProviderPage,
  pageCounters,
  pageMentionsCount,
  pagePublicationsCount,
  pageShownTab,
  pageTabs,
  profileRingState,
  type WithPageExtras,
} from "@orasso/shared";
import { useEffect, useState } from "react";

import { FicheBar, ficheHandle } from "../components/FicheBar";
import { PageFollow } from "../components/pages/PageFollow";
import { PageHead } from "../components/pages/PageHead";
import { PageMentions } from "../components/pages/PageMentions";
import { PageMore } from "../components/pages/PageMore";
import { PagePrestations } from "../components/pages/PagePrestations";
import { PagePublications } from "../components/pages/PagePublications";
import { mentionsShown, PageTabs } from "../components/pages/PageTabs";
import { ReportDialog } from "../components/ReportDialog";
import { ShareButtons } from "../components/ShareButtons";
import { actorOfParam } from "../lib/actor";
import { apiOrThrow, originOf, requireMe, safeReturn } from "../lib/api.server";
import "../styles/pages.css";
import "../styles/providers.css";
import type { Route } from "./+types/prestataires";

// Lot M7 : fiche ou parcours, mode B (en-tête de fiche, sans bande ni barre d'onglets).
export const handle = ficheHandle;

export function meta({ loaderData: d }: Route.MetaArgs) {
  return [{ title: `${d?.provider.name ?? P.providerPage} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const url = new URL(request.url);
  // Lot M7, tour 2 : le ✕ revient à l'écran d'origine (`?retour=`, chemin interne seulement).
  const back = safeReturn(url.searchParams.get("retour"), "/app");
  const me = await requireMe(request);
  // Lot R9h (T48) : la casquette qui regarde est portée par l'adresse (`?auteur=`), revérifiée ici et par l'API.
  const actor = actorOfParam(url.searchParams.get("auteur"), me.personas);
  const provider = await apiOrThrow<WithPageExtras<ProviderPage>>(
    request,
    `/providers/${encodeURIComponent(params.id)}`,
    {
      actor,
    },
  );
  const owner = me.personas.some((p) => p.kind === "provider" && p.id === provider.id);
  const tab = pageShownTab("provider", {
    raw: url.searchParams.get(PAGE_TAB_PARAM),
    counts: { publications: pagePublicationsCount(provider) },
    session: true,
  });
  return { back, provider, owner, actor, tab, origin: originOf(request) };
}

export default function Prestataires({ loaderData }: Route.ComponentProps) {
  const { back, provider, owner, actor, tab, origin } = loaderData;
  const [follow, setFollow] = useState({ following: provider.isFollowing, followers: provider.followersCount });
  const [mentionsDelta, setMentionsDelta] = useState(0);
  // Le nombre servi fait foi : la correction locale repart de zéro à chaque nombre neuf ou autre page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: chaque réponse servie neuve remet l'état à zéro
  useEffect(() => {
    setFollow({ following: provider.isFollowing, followers: provider.followersCount });
    setMentionsDelta(0);
  }, [provider]);
  const path = `/providers/${provider.id}`;
  // La casquette qui regarde reste dans l'adresse des onglets.
  const tabPath = actor ? `${path}?auteur=${encodeURIComponent(actor)}` : path;
  const key = authorKeyOf("provider", provider.id);
  const tabs = pageTabs("provider", {
    session: true,
    mentionsCount: mentionsShown(pageMentionsCount(provider), mentionsDelta),
  });
  const counters = pageCounters("provider", {
    followers: follow.followers,
    missions: provider.missionsCount ?? null,
    organizers: provider.organizersCount ?? null,
  });
  return (
    <>
      <FicheBar title={P.providerPage} back={back} />
      <div className="s-narrow s-stack pg-page" data-testid="provider-public">
        <PageHead
          testId="provider-head"
          name={provider.name}
          logoUrl={null}
          ring={profileRingState(provider.stories)}
          storiesHref={(provider.stories?.count ?? 0) > 0 ? `/app/story/${encodeURIComponent(key)}` : undefined}
          typeLabel={provider.typeLabel || L.typeProvider}
          verifiedLabel={null}
          follow={
            owner ? null : (
              <PageFollow
                targetKey={key}
                actor={actor}
                following={follow.following}
                onDone={(r: PageFollowResult) => setFollow({ following: r.following, followers: r.followersCount })}
              />
            )
          }
          bio={provider.description}
          side={
            <PageMore>
              <div className="s-stack s-stack--tight">
                <ShareButtons url={`${origin}${path}`} title={`${provider.name} sur Orasso`} />
                {owner ? (
                  <a className="s-linkbutton o-t-button" href="/app/prestataire/page" data-testid="page-edit">
                    {L.edit}
                  </a>
                ) : (
                  // Lot R4b, tour 2 : le signalement d'un prestataire (il était sur la fiche de l'événement, qui l'a confié au plateau).
                  <ReportDialog look="link" targetType="provider" targetId={provider.id} />
                )}
              </div>
            </PageMore>
          }
          counters={counters}
        />

        <PageTabs value={tab} items={tabs} path={tabPath} />

        {tab === "services" ? (
          <PagePrestations provider={provider} />
        ) : tab === "publications" ? (
          <PagePublications
            authorKey={key}
            name={provider.name}
            path={tabPath}
            withFilter={false}
            filter="all"
            total={pagePublicationsCount(provider) ?? null}
            session
            publicFirst={null}
          />
        ) : (
          <PageMentions
            pageKey={key}
            pageName={provider.name}
            manage={owner}
            onHiddenChange={(d) => setMentionsDelta((v) => v + d)}
          />
        )}
      </div>
    </>
  );
}
