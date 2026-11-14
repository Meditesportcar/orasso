// La « Page » du propriétaire, sur le site (lot R9h partie 2, T50 ; lot R9b de l'appli, maquette R9.3 `n-page`, vue « Le propriétaire ») :
// l'adresse « Page » des quatre casquettes (organisateur, pro, prestataire, média), au gabarit de la page publique de R8g (le haut compact
// du Profil, adapté) : le logo dans l'anneau de ses stories, le nom (il passe à la ligne, jamais tronqué), le type et la vérification,
// **pas** de « Suivre », à droite « QR de la page » et « Réglages », la bande de trois compteurs, la bio sur une ligne. Dessous les chips
// de gestion (`PageGest`), les onglets soulignés et collants (« Publications » ouvert par défaut quand il y en a), le corps de l'onglet,
// puis le pied « Mes casquettes ». Les écrans de réglage d'hier (Structure, Équipe, Ma fiche, Vitrine, Modifier ma page) ne bougent pas :
// ils s'ouvrent depuis les chips. Un seul bouton principal à l'écran : « Publier » (Publications), « Publier une offre » (Offres) ou
// « Nouvel album » (Albums), jamais deux à la fois.
import { Icon } from "@orasso/design-system/web";
import {
  type AlbumsList,
  type AuthorPostsFilter,
  authorKeyOf,
  casquettesLabels as CL,
  type EventCard,
  pagesLabels as L,
  type MediaPage,
  type PageTab,
  type ProCard,
  type ProPublic,
  type ProviderPage,
  pageCounters,
  pageMentionsCount,
  pagePublicationsCount,
  pageTabs,
  profileRingState,
  type StructurePublic,
  type WithPageExtras,
} from "@orasso/shared";
import { useEffect, useState } from "react";

import "../../styles/pages.css";
import { useCasquette } from "../../lib/actor";
import { SideIcon } from "../profile/ProfileHead";
import { PageAlbums, PageOwnLinks } from "./PageAlbums";
import { type GestItem, PageGest } from "./PageGest";
import { PageHead } from "./PageHead";
import { PageMentions } from "./PageMentions";
import { PageOffers } from "./PageOffers";
import { PagePrestations } from "./PagePrestations";
import { PagePublications } from "./PagePublications";
import { PageQr } from "./PageQr";
import { mentionsShown, PageTabs, pageTabHref } from "./PageTabs";
import { StructureEvents } from "./StructureEvents";

type Common = { origin: string; tab: PageTab };

/** Ce que le chargeur de la route lit de sa page, quelle que soit la casquette (une seule lecture de sa fiche publique). */
export type OwnerData =
  | (Common & {
      kind: "organizer";
      page: WithPageExtras<StructurePublic>;
      slug: string;
      filter: AuthorPostsFilter;
      eventsComplete: boolean;
      upcoming: EventCard[];
      past: EventCard[];
      partners: ProCard[];
      inviteToken: string | null;
    })
  | (Common & { kind: "pro"; page: WithPageExtras<ProPublic>; slug: string })
  | (Common & { kind: "provider"; page: WithPageExtras<ProviderPage> })
  | (Common & { kind: "media"; page: WithPageExtras<MediaPage>; albums: AlbumsList | null });

/** Le chemin de la Page dans son espace (les onglets, `?onglet=`, y sont ajoutés). */
function pagePathOf(data: OwnerData): string {
  switch (data.kind) {
    case "organizer":
      return `/orga/${data.slug}/page`;
    case "pro":
      return `/pro/${data.slug}/page`;
    case "provider":
      return "/app/prestataire/page";
    case "media":
      return "/app/media/page";
  }
}

/** L'adresse publique de la page (la même que celle du QR et du partage). */
function publicPathOf(data: OwnerData): string {
  switch (data.kind) {
    case "organizer":
      return `/o/${data.slug}`;
    case "pro":
      return `/p/${data.slug}`;
    case "provider":
      return `/providers/${data.page.id}`;
    case "media":
      return `/m/${data.page.id}`;
  }
}

/** Les chips de gestion de chaque casquette (maquette `r9gest`) : les écrans de réglage d'hier, ouverts depuis la Page. */
function gestOf(data: OwnerData): GestItem[] {
  switch (data.kind) {
    case "organizer":
      return [
        { id: "team", icon: "staff", label: L.gestTeam, href: `/orga/${data.slug}/staff` },
        { id: "structure", icon: "gear", label: L.gestStructure, href: `/orga/${data.slug}/structure` },
      ];
    case "pro":
      return [
        { id: "fiche", icon: "edit", label: L.gestFiche, href: `/pro/${data.slug}` },
        { id: "subscription", icon: "star", label: L.gestSubscription, href: `/pro/${data.slug}/abonnement` },
      ];
    case "provider":
      return [{ id: "vitrine", icon: "edit", label: L.gestVitrine, href: "/app/prestataire" }];
    case "media":
      return [{ id: "media", icon: "edit", label: L.gestMedia, href: "/app/media" }];
  }
}

function headOf(data: OwnerData) {
  switch (data.kind) {
    case "organizer": {
      const s = data.page;
      return {
        authorKind: "structure" as const,
        name: s.name,
        logoUrl: s.logoUrl,
        typeLabel: L.typeStructure,
        verifiedLabel: s.verified ? L.verifiedStructure : null,
        bio: s.description,
      };
    }
    case "pro": {
      const p = data.page;
      return {
        authorKind: "pro" as const,
        name: p.name,
        logoUrl: p.logoUrl,
        typeLabel: L.typePro,
        verifiedLabel: p.verified ? L.verifiedPro : null,
        bio: p.description,
      };
    }
    case "provider": {
      const p = data.page;
      return {
        authorKind: "provider" as const,
        name: p.name,
        logoUrl: null,
        typeLabel: p.typeLabel || L.typeProvider,
        verifiedLabel: null,
        bio: p.description,
      };
    }
    case "media": {
      const p = data.page;
      return {
        authorKind: "media" as const,
        name: p.name,
        logoUrl: p.logoUrl,
        typeLabel: L.typeMedia,
        verifiedLabel: p.verified ? L.verifiedMedia : null,
        bio: p.description,
      };
    }
  }
}

export function OwnerPage({ data }: { data: OwnerData }) {
  const casquette = useCasquette();
  const [mentionsDelta, setMentionsDelta] = useState(0);
  // Le nombre servi fait foi : la correction locale (masqué ou remis) repart de zéro à chaque réponse servie neuve.
  // biome-ignore lint/correctness/useExhaustiveDependencies: chaque réponse servie neuve remet le delta à zéro
  useEffect(() => setMentionsDelta(0), [data]);

  const head = headOf(data);
  const page = data.page;
  const key = authorKeyOf(head.authorKind, page.id);
  const path = pagePathOf(data);
  const publicPath = publicPathOf(data);
  const pageKind = data.kind === "organizer" ? "structure" : data.kind;
  const tabs = pageTabs(pageKind, {
    session: true,
    owner: true,
    mentionsCount: mentionsShown(pageMentionsCount(page), mentionsDelta),
  });
  const tab = tabs.some((t) => t.id === data.tab) ? data.tab : (tabs[0]?.id ?? "publications");
  // Survol d'assistance, page suspendue : pas de casquette dans l'espace, donc pas de « Publier » au nom de la page (T48).
  const publishAs = casquette && casquette.key === key ? key : undefined;

  const counters =
    data.kind === "organizer"
      ? pageCounters("structure", {
          followers: data.page.followersCount,
          events: data.eventsComplete ? data.upcoming.length + data.past.length : null,
          partners: data.partners.length,
        })
      : data.kind === "pro"
        ? pageCounters("pro", {
            followers: data.page.followersCount,
            partners: data.page.memberPartnersTotal,
            organizers: data.page.partners.length,
            offers: data.page.offers?.current,
          })
        : data.kind === "provider"
          ? pageCounters("provider", {
              followers: data.page.followersCount,
              missions: data.page.missionsCount ?? null,
              organizers: data.page.organizersCount ?? null,
            })
          : pageCounters("media", {
              followers: data.page.followersCount,
              albums: data.page.albumsCount ?? null,
              photos: data.page.photosCount ?? null,
            });
  const counterHref = (k: string): string | undefined =>
    (k === "events" || k === "partners") && data.kind === "organizer"
      ? pageTabHref(path, "events")
      : k === "offers" && data.kind === "pro"
        ? pageTabHref(path, "offers")
        : undefined;

  return (
    <div className="s-stack pg-page" data-testid="owner-page" data-kind={data.kind}>
      <PageHead
        testId="owner-head"
        name={head.name}
        logoUrl={head.logoUrl}
        ring={profileRingState(page.stories)}
        storiesHref={(page.stories?.count ?? 0) > 0 ? `/app/story/${encodeURIComponent(key)}` : undefined}
        typeLabel={head.typeLabel}
        verifiedLabel={head.verifiedLabel}
        follow={null}
        bio={head.bio}
        side={
          <>
            <PageQr name={head.name} url={`${data.origin}${publicPath}`} />
            <SideIcon icon="gear" label={L.settings} href="/app/moi#reglages" testId="page-settings" />
          </>
        }
        counters={counters}
        counterHref={counterHref}
      />
      <PageGest items={gestOf(data)} />

      <PageTabs value={tab} items={tabs} path={path} />

      {tab === "events" && data.kind === "organizer" ? (
        <StructureEvents
          structure={data.page}
          upcoming={data.upcoming}
          past={data.past}
          partners={data.partners}
          inviteToken={data.inviteToken}
          origin={data.origin}
        />
      ) : tab === "publications" ? (
        <PagePublications
          authorKey={key}
          name={head.name}
          path={path}
          withFilter={data.kind === "organizer"}
          filter={data.kind === "organizer" ? data.filter : "all"}
          total={pagePublicationsCount(page) ?? null}
          session
          publicFirst={null}
          publishAs={publishAs}
        />
      ) : tab === "offers" && data.kind === "pro" ? (
        <PageOffers
          authorKey={key}
          pro={data.page}
          owner
          publishHref={`/app/fil/publier?fiche=${encodeURIComponent(data.page.id)}&etiquette=offre`}
        />
      ) : tab === "services" && data.kind === "provider" ? (
        <PagePrestations provider={data.page} />
      ) : tab === "albums" && data.kind === "media" ? (
        <PageAlbums mediaId={data.page.id} owner first={data.albums} counts={data.page}>
          <PageOwnLinks mediaId={data.page.id} />
        </PageAlbums>
      ) : (
        <PageMentions
          pageKey={key}
          pageName={head.name}
          manage
          onHiddenChange={(d) => setMentionsDelta((v) => v + d)}
        />
      )}

      {/* Le pied (maquette `r8mrow`) : les casquettes vivent dans « Mes casquettes ». */}
      <a className="pg-row" href="/app/moi" data-testid="page-row-casquettes">
        <span className="pg-row__icon" aria-hidden="true">
          <Icon name="profile" size={20} />
        </span>
        <span className="pg-row__text">
          <strong>{CL.pageRow}</strong>
          <span className="o-t-caption s-muted">{CL.pageRowCaption}</span>
        </span>
        <Icon name="next" size={18} />
      </a>
    </div>
  );
}
