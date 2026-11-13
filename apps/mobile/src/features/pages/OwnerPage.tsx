// La « Page » du propriétaire (lot R9b, maquette R9.3 `n-page`, vue « Le propriétaire ») : l'onglet « Page » des quatre casquettes
// (organisateur, pro, prestataire, média), au gabarit de la page publique de R8g (le haut « Compact » du Profil, adapté) : le logo
// dans l'anneau de ses stories, le nom (il passe à la ligne, jamais tronqué), le type et la vérification, **pas** de « Suivre »,
// à droite « QR de la page » et « Réglages » (ceux du compte, comme le Profil), la bande de trois compteurs, la bio sur une ligne.
// Dessous les chips de gestion (`PageGest`), les onglets soulignés et collants (« Publications » ouvert par défaut), le corps de
// l'onglet, puis le pied « Mes casquettes ». Les écrans de réglage d'hier (Structure, Équipe, Ma fiche, Vitrine, Modifier ma page)
// ne bougent pas : ils s'ouvrent depuis les chips. Un seul bouton principal à l'écran : « Publier » (Publications), « Publier une
// offre » (Offres) ou « Ajouter un contenu » (Contenus), jamais deux à la fois.
import { tokens, useTheme } from "@orasso/design-system/native";
import {
  type AuthorPostsFilter,
  authorKeyOf,
  casquettesLabels as CL,
  type EventCard,
  explicitPageTab,
  pagesLabels as L,
  type MediaPage,
  orgaManageLabels,
  type PageKind,
  type PageTab,
  type ProCard,
  type ProOwner,
  type ProPublic,
  type ProviderPage,
  pageCounters,
  pageMentionsCount,
  pageOpenTab,
  pagePublicationsCount,
  pageTabs,
  profileRingState,
  type StructurePublic,
  type WithPageExtras,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";

import { OrgaGate } from "@/features/orga/OrgaGate";
import { PageHead } from "@/features/pages/PageHead";
import { SideIcon } from "@/features/profil/ProfileHead";
import { HubRow, RowIcon } from "@/features/profil/parts";
import { api } from "@/lib/api";
import { usePersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { PageFooterProvider } from "@/ui/pageFooter";
import { StickyHeader, TabScreen } from "@/ui/Screens";
import { openCasquettes } from "../casquettes/sheetStore";
import { PageContents } from "./PageContents";
import { PageGest } from "./PageGest";
import { PageMentions } from "./PageMentions";
import { PageOffers } from "./PageOffers";
import { PagePrestations } from "./PagePrestations";
import { PagePublications } from "./PagePublications";
import { PageQrSheet } from "./PageQrSheet";
import { PageTabs } from "./PageTabs";
import { publicPathOf } from "./pageLinks";
import { StructureEvents } from "./StructureEvents";
import { useReloadToken } from "./useReloadToken";

const { space1, space4 } = tokens.spacing;

export type OwnerKind = "organizer" | "pro" | "provider" | "media";
const PAGE_KIND: Record<OwnerKind, PageKind> = {
  organizer: "structure",
  pro: "pro",
  provider: "provider",
  media: "media",
};

/** Ce que l'en-tête et les onglets lisent d'une page, quelle que soit la casquette (une seule lecture de sa fiche publique). */
type Loaded =
  | { kind: "organizer"; page: WithPageExtras<StructurePublic>; slug: string }
  | { kind: "pro"; page: WithPageExtras<ProPublic>; slug: string }
  | { kind: "provider"; page: WithPageExtras<ProviderPage> }
  | { kind: "media"; page: WithPageExtras<MediaPage> };

export function OwnerPage({ kind }: { kind: OwnerKind }) {
  const body = <OwnerPageBody kind={kind} />;
  return (
    <PageFooterProvider footer={<MyCasquettesRow />}>
      {/* L'organisateur passe par sa garde (double authentification), comme tout écran de son espace. */}
      {kind === "organizer" ? <OrgaGate title={orgaManageLabels.structureTitle}>{body}</OrgaGate> : body}
    </PageFooterProvider>
  );
}

/** Le pied : la ligne « Mes casquettes » (maquette `r8mrow`), qui ouvre la feuille de R9n. */
function MyCasquettesRow() {
  return (
    <HubRow
      lead={<RowIcon name="profile" />}
      title={CL.pageRow}
      caption={CL.pageRowCaption}
      onPress={openCasquettes}
      testID="page-row-casquettes"
    />
  );
}

function OwnerPageBody({ kind }: { kind: OwnerKind }) {
  const { t } = useTheme();
  const router = useRouter();
  const { active } = usePersona();
  const { onglet } = useLocalSearchParams<{ onglet?: string }>();
  const pageKind = PAGE_KIND[kind];
  const id = active.kind === kind ? active.id : null;

  // --- La page : sa fiche publique, lue comme la lirait un membre (anneau, abonnés, compteurs) ---------------------------------
  const slug = useOwnerSlug(kind, id);
  const loaded = useApi<Loaded | null>(
    async () => {
      if (!id) return null;
      if (kind === "organizer") {
        if (!slug) return null;
        return { kind, slug, page: (await api.structureBySlug(slug)) as WithPageExtras<StructurePublic> };
      }
      if (kind === "pro") {
        if (!slug) return null;
        return { kind, slug, page: (await api.proBySlug(slug)) as WithPageExtras<ProPublic> };
      }
      if (kind === "provider") return { kind, page: (await api.providerById(id)) as WithPageExtras<ProviderPage> };
      return { kind, page: (await api.mediaById(id)) as WithPageExtras<MediaPage> };
    },
    [kind, id, slug],
    {
      enabled: Boolean(id) && (kind === "provider" || kind === "media" || Boolean(slug)),
      cacheKey: `owner-page-${kind}-${id}`,
    },
  );
  const data = loaded.data;
  const organizer = data?.kind === "organizer" ? data.page : null;

  // Les listes de l'onglet « Événements » de la structure (comme sa page publique) ; `null` tant qu'elles ne sont pas lues.
  const upcoming = useApi(
    () => api.exploreEvents({ structureId: organizer?.id, sort: "date", limit: 50 }),
    [organizer?.id],
    {
      enabled: Boolean(organizer),
    },
  );
  const past = useApi(
    () => api.exploreEvents({ structureId: organizer?.id, scope: "past", limit: 12 }),
    [organizer?.id],
    {
      enabled: Boolean(organizer),
    },
  );
  const partners = useApi(
    () => api.structurePros(data?.kind === "organizer" ? data.slug : ""),
    [data?.kind === "organizer" ? data.slug : null],
    {
      enabled: Boolean(organizer),
    },
  );

  const [picked, setPicked] = useState<PageTab | null>(null);
  const [filter, setFilter] = useState<AuthorPostsFilter>("all");
  const [mentionsDelta, setMentionsDelta] = useState(0);
  const [qr, setQr] = useState(false);
  const [reloadToken, bumpReload] = useReloadToken();
  // Le nombre servi fait foi : la correction locale (masqué ou remis) repart de zéro à chaque réponse servie neuve.
  // biome-ignore lint/correctness/useExhaustiveDependencies: chaque réponse servie neuve remet le delta à zéro
  useEffect(() => setMentionsDelta(0), [data]);

  // `?onglet=` s'applique à chaque navigation ; une fois lu, on le retire (un lien partagé ou une notification ouvre le bon onglet).
  useEffect(() => {
    if (onglet === undefined) return;
    const asked = explicitPageTab(pageKind, onglet, true, true);
    if (asked) setPicked(asked);
    router.setParams({ onglet: undefined });
  }, [onglet, router, pageKind]);

  const counts = data ? data.page : null;
  const mentionsBase = counts ? pageMentionsCount(counts) : undefined;
  const mentionsCount = mentionsBase === undefined ? undefined : Math.max(0, mentionsBase + mentionsDelta);
  const tabs = pageTabs(pageKind, { session: true, mentionsCount, owner: true });
  const wanted =
    picked ?? pageOpenTab(pageKind, { publications: counts ? pagePublicationsCount(counts) : undefined }, true, true);
  const tab = tabs.some((x) => x.id === wanted) ? wanted : (tabs[0]?.id ?? "publications");

  const reloadAll = async () => {
    bumpReload();
    // Les listes de la structure ne se relisent que pour l'organisateur (sinon `reload` lirait les événements de tous).
    await Promise.all([loaded.reload(), ...(organizer ? [upcoming.reload(), past.reload(), partners.reload()] : [])]);
  };

  // --- L'en-tête -------------------------------------------------------------------------------------------------------------
  const head = data ? headOf(data) : null;
  const key = head ? authorKeyOf(head.authorKind, head.id) : null;
  const eventsRead =
    upcoming.data && past.data && !upcoming.data.nextCursor && !past.data.nextCursor
      ? upcoming.data.items.length + past.data.items.length
      : null;
  const counters = !data
    ? []
    : data.kind === "organizer"
      ? pageCounters("structure", {
          followers: data.page.followersCount,
          events: eventsRead,
          partners: partners.data ? partners.data.length : null,
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
              accreditations: data.page.accreditationsCount ?? null,
              publications: pagePublicationsCount(data.page) ?? null,
            });

  const gest = gestOf(kind, router);
  const upcomingItems: EventCard[] | null = upcoming.data ? upcoming.data.items : null;
  const pastItems: EventCard[] | null = past.data ? past.data.items : null;
  const partnerItems: ProCard[] | null = partners.data ?? null;

  return (
    <TabScreen
      onRefresh={reloadAll}
      overlays={
        head ? <PageQrSheet visible={qr} onClose={() => setQr(false)} name={head.name} path={head.path} /> : null
      }
    >
      {!data || !head || !key ? (
        loaded.error && !data ? (
          <Notice tone="error">{loaded.error.message}</Notice>
        ) : (
          <Muted variant="body" testID="page-loading">
            Chargement…
          </Muted>
        )
      ) : (
        <PageHead
          testID="owner-head"
          name={head.name}
          logoUrl={head.logoUrl}
          ring={profileRingState(head.stories)}
          onOpenStories={
            (head.stories?.count ?? 0) > 0
              ? () => router.push({ pathname: "/story/[authorKey]", params: { authorKey: key } })
              : undefined
          }
          typeLabel={head.typeLabel}
          verifiedLabel={head.verifiedLabel}
          follow={null}
          bio={head.bio}
          side={
            <>
              <SideIcon icon="qr" label={L.qrPage} onPress={() => setQr(true)} testID="page-qr-open" />
              <SideIcon
                icon="gear"
                label={L.settings}
                onPress={() => router.push("/reglages")}
                testID="page-settings"
              />
            </>
          }
          counters={counters}
          onCounter={(k) =>
            setPicked(
              k === "events" || k === "partners"
                ? kind === "organizer"
                  ? "events"
                  : null
                : k === "offers"
                  ? "offers"
                  : k === "publications"
                    ? "publications"
                    : null,
            )
          }
        />
      )}
      {/* Sans condition : sans réseau ni cache, les écrans de réglage restent à un toucher (lot R9b, tour 1). */}
      <PageGest items={gest} />
      {data ? (
        // Onglets soulignés, collants sous l'en-tête (`StickyHeader`, repéré par l'écran).
        <StickyHeader style={[styles.tabsBar, { backgroundColor: t.color.ground }]}>
          <PageTabs value={tab} onChange={setPicked} items={tabs} />
        </StickyHeader>
      ) : null}
      {data && head && key ? (
        tab === "events" && data.kind === "organizer" ? (
          <StructureEvents structure={data.page} upcoming={upcomingItems} past={pastItems} partners={partnerItems} />
        ) : tab === "publications" ? (
          <PagePublications
            reloadToken={reloadToken}
            authorKey={key}
            name={head.name}
            withFilter={data.kind === "organizer"}
            filter={filter}
            onFilter={setFilter}
            total={pagePublicationsCount(data.page) ?? null}
            session
            publishAs={key}
          />
        ) : tab === "offers" && data.kind === "pro" ? (
          <PageOffers
            reloadToken={reloadToken}
            authorKey={key}
            pro={data.page}
            owner
            onPublish={() =>
              router.push({ pathname: "/fil/publier", params: { fiche: data.page.id, etiquette: "offre" } })
            }
          />
        ) : tab === "services" && data.kind === "provider" ? (
          <PagePrestations provider={data.page} />
        ) : tab === "contents" && data.kind === "media" ? (
          <PageContents mediaId={data.page.id} owner reloadToken={reloadToken} />
        ) : (
          <PageMentions
            reloadToken={reloadToken}
            pageKey={key}
            pageName={head.name}
            manage
            onHiddenChange={(d) => setMentionsDelta((v) => v + d)}
          />
        )
      ) : null}
    </TabScreen>
  );
}

/** Le slug de la structure (par ses adhésions) ou de la fiche pro (par `GET /me/pro`) : l'adresse de sa page publique. */
function useOwnerSlug(kind: OwnerKind, id: string | null): string | null {
  const { me } = useSession();
  const myPro = useApi(() => api.myPro(), [kind], { enabled: kind === "pro", cacheKey: "my-pro" });
  if (kind === "organizer") return me?.memberships.find((m) => m.structureId === id)?.structureSlug ?? null;
  if (kind === "pro") return (myPro.data as ProOwner | null)?.slug ?? null;
  return null;
}

function headOf(data: Loaded): {
  id: string;
  authorKind: "structure" | "pro" | "provider" | "media";
  name: string;
  logoUrl: string | null;
  stories: Loaded["page"]["stories"];
  typeLabel: string;
  verifiedLabel: string | null;
  bio: string | null;
  path: string | null;
} {
  switch (data.kind) {
    case "organizer": {
      const s = data.page;
      return {
        id: s.id,
        authorKind: "structure",
        name: s.name,
        logoUrl: s.logoUrl,
        stories: s.stories,
        typeLabel: L.typeStructure,
        verifiedLabel: s.verified ? L.verifiedStructure : null,
        bio: s.description,
        path: publicPathOf("structure", { slug: data.slug, id: s.id }),
      };
    }
    case "pro": {
      const p = data.page;
      return {
        id: p.id,
        authorKind: "pro",
        name: p.name,
        logoUrl: p.logoUrl,
        stories: p.stories,
        typeLabel: L.typePro,
        verifiedLabel: p.verified ? L.verifiedPro : null,
        bio: p.description,
        path: publicPathOf("pro", { slug: data.slug, id: p.id }),
      };
    }
    case "provider": {
      const p = data.page;
      return {
        id: p.id,
        authorKind: "provider",
        name: p.name,
        logoUrl: null,
        stories: p.stories,
        typeLabel: p.typeLabel || L.typeProvider,
        verifiedLabel: null,
        bio: p.description,
        path: publicPathOf("provider", { id: p.id }),
      };
    }
    case "media": {
      const p = data.page;
      return {
        id: p.id,
        authorKind: "media",
        name: p.name,
        logoUrl: p.logoUrl,
        stories: p.stories,
        typeLabel: L.typeMedia,
        verifiedLabel: p.verified ? L.verifiedMedia : L.pendingMedia,
        bio: p.description,
        path: publicPathOf("media", { id: p.id }),
      };
    }
  }
}

/** Les chips de gestion de chaque casquette (maquette `r9gest`) : les écrans de réglage d'hier, ouverts depuis la Page. */
function gestOf(kind: OwnerKind, router: ReturnType<typeof useRouter>) {
  switch (kind) {
    case "organizer":
      return [
        {
          id: "team",
          icon: "staff" as const,
          label: L.gestTeam,
          onPress: () => router.navigate("/(orga)/equipe" as never),
        },
        {
          id: "structure",
          icon: "gear" as const,
          label: L.gestStructure,
          onPress: () => router.navigate("/(orga)/structure" as never),
        },
      ];
    case "pro":
      return [
        {
          id: "fiche",
          icon: "edit" as const,
          label: L.gestFiche,
          onPress: () => router.navigate("/(pro)/fiche?segment=edit" as never),
        },
        {
          id: "subscription",
          icon: "star" as const,
          label: L.gestSubscription,
          onPress: () => router.navigate("/(pro)/fiche?bloc=abonnement" as never),
        },
      ];
    case "provider":
      return [
        {
          id: "vitrine",
          icon: "edit" as const,
          label: L.gestVitrine,
          onPress: () => router.navigate("/(provider)/vitrine" as never),
        },
      ];
    case "media":
      return [
        {
          id: "media",
          icon: "edit" as const,
          label: L.gestMedia,
          onPress: () => router.push("/media/modifier" as never),
        },
      ];
  }
}

const styles = StyleSheet.create({
  tabsBar: { marginHorizontal: -space4, paddingHorizontal: space4, paddingBottom: space1 },
});
