// Fiche d'un pro dans l'appli (lot 29, docs/02 « Pages atteintes »), vue d'un visiteur. Ce que la fiche montre suit `proVisibility`
// (fiche de base après le 21/06/2027 sans abonnement) : l'API ne renvoie ni remises ni publications dans ce cas. Ouverte sans
// compte ; suivre demande un compte.
// Lot R8g (D40, maquettes R8.6 `pu-publi` et R9.3 `n-page`) : le haut compact du Profil (logo dans l'anneau de ses stories, nom,
// « Pro » et « Pro vérifié », « Suivre », bio sur une ligne, icônes « Itinéraire » et « Plus ») puis des onglets soulignés et
// collants : « Présentation » (tout le contenu d'hier), « Publications » (les siennes, ouvert par défaut quand il y en a),
// « Offres » (lot R9c : ses offres non terminées et, dessous, ses anciennes « offres et actualités »), « Mentions · N » (ses collaborations
// commerciales et ceux qui le citent). Sans session : « Présentation » seule (T4).
import { tokens, useTheme } from "@orasso/design-system/native";
import {
  authorKeyOf,
  explicitPageTab,
  explorerLabels,
  isPageManager,
  pagesLabels as L,
  type PageTab,
  type ProPublic,
  pageCounters,
  pageMentionsCount,
  pageOpenTab,
  pagePublicationsCount,
  pageTabs,
  profileRingState,
  type WithPageExtras,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, Share, StyleSheet } from "react-native";

import { siteUrl } from "@/api";
import { FollowLine, PageHead } from "@/features/pages/PageHead";
import { PageMentions } from "@/features/pages/PageMentions";
import { PageOffers } from "@/features/pages/PageOffers";
import { PagePublications } from "@/features/pages/PagePublications";
import { PageTabs } from "@/features/pages/PageTabs";
import { ProPresentation } from "@/features/pages/ProPresentation";
import { useReloadToken } from "@/features/pages/useReloadToken";
import { SideIcon } from "@/features/profil/ProfileHead";
import { SetList, SetRow } from "@/features/profil/parts";
import { openReport } from "@/features/ReportSheet";
import { PhotoViewer } from "@/features/vehicle/PhotoViewer";
import { api } from "@/lib/api";
import { errorMessage, request } from "@/lib/http";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { Overlay } from "@/ui/Overlay";
import { FlowScreen, StickyHeader } from "@/ui/Screens";

const { space1, space4 } = tokens.spacing;

export default function ProPage() {
  const { t } = useTheme();
  const router = useRouter();
  const { slug, onglet } = useLocalSearchParams<{ slug: string; onglet?: string }>();
  const { status } = useSession();
  const session = status === "in";
  const pro = useApi(() => api.proBySlug(slug), [slug, status], { enabled: status !== "loading" });
  const p = pro.data as WithPageExtras<ProPublic> | null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const [picked, setPicked] = useState<PageTab | null>(null);
  const [mentionsDelta, setMentionsDelta] = useState(0);
  const mentionsBase = p ? pageMentionsCount(p) : undefined;
  // Le nombre servi fait foi : la correction locale (masqué ou remis) repart de zéro à chaque nombre neuf.
  // biome-ignore lint/correctness/useExhaustiveDependencies: chaque réponse servie neuve remet le delta à zéro
  useEffect(() => setMentionsDelta(0), [p, slug]);
  const [reloadToken, bumpReload] = useReloadToken();
  const viewed = useRef<string | null>(null);

  // Une vue comptée par fiche et par ouverture (jamais celle du pro : l'API l'ignore).
  useEffect(() => {
    if (!p || viewed.current === p.slug) return;
    viewed.current = p.slug;
    void request(`/api/pros/by-slug/${encodeURIComponent(p.slug)}/track`, {
      method: "POST",
      body: { kind: "view" },
    }).catch(() => undefined);
  }, [p]);

  // `?onglet=` s'applique à chaque navigation ; une fois lu, on le retire.
  useEffect(() => {
    if (onglet === undefined) return;
    const asked = explicitPageTab("pro", onglet, session);
    if (asked) setPicked(asked);
    router.setParams({ onglet: undefined });
  }, [onglet, router, session]);

  const close = () => (router.canGoBack() ? router.back() : router.replace(status === "in" ? "/" : "/auth"));
  const track = (kind: "call" | "route") =>
    void request(`/api/pros/by-slug/${encodeURIComponent(slug)}/track`, { method: "POST", body: { kind } }).catch(
      () => undefined,
    );

  if (!p) {
    return (
      <FlowScreen title="Pro" onClose={close}>
        {pro.error ? (
          <Notice tone="error">{pro.error.status === 404 ? explorerLabels.proMissing : pro.error.message}</Notice>
        ) : (
          <Muted variant="body">Chargement…</Muted>
        )}
      </FlowScreen>
    );
  }

  async function toggleFollow() {
    if (!p) return;
    if (!session) {
      router.push({ pathname: "/auth", params: { mode: "signup", next: `/p/${slug}` } });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (p.isFollowing) await api.unfollowPro(p.id);
      else await api.followPro(p.id);
      await pro.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const hasPosition = p.lat !== null && p.lng !== null;
  const mentionsCount = mentionsBase === undefined ? undefined : Math.max(0, mentionsBase + mentionsDelta);
  const tabs = pageTabs("pro", { session, mentionsCount });
  const wanted = picked ?? pageOpenTab("pro", { publications: pagePublicationsCount(p) }, session);
  const tab = tabs.some((x) => x.id === wanted) ? wanted : (tabs[0]?.id ?? "presentation");
  const counters = pageCounters("pro", {
    followers: p.followersCount,
    partners: p.memberPartnersTotal,
    organizers: p.partners.length,
    offers: p.offers?.current,
  });
  const key = authorKeyOf("pro", p.id);
  const ring = session ? profileRingState(p.stories) : null;
  const owner = isPageManager("pro", { isOwner: p.isOwner });
  return (
    <FlowScreen
      title={p.name}
      onClose={close}
      onRefresh={async () => {
        bumpReload();
        await pro.reload();
      }}
      overlays={
        <>
          <PhotoViewer
            photos={p.photos.map((x, i) => ({
              id: x.id,
              url: x.url,
              position: i + 1,
              width: 4,
              height: 3,
              plateBlurred: false,
            }))}
            start={viewer}
            onClose={() => setViewer(null)}
          />
          <Overlay>
            <AppSheet visible={more} onClose={() => setMore(false)} accessibilityLabel={L.moreTitle}>
              <SetList>
                <SetRow
                  first
                  icon="share"
                  title={L.share}
                  onPress={() => {
                    setMore(false);
                    void Share.share({ message: siteUrl(`/p/${p.slug}`) }).catch(() => undefined);
                  }}
                  testID="page-share"
                />
                {/* Signaler (lot 32) : la fiche d'un autre, connecté. */}
                {session && !p.isOwner ? (
                  <SetRow
                    icon="flag"
                    title={L.reportPro}
                    onPress={() => {
                      setMore(false);
                      openReport({ type: "pro", id: p.id });
                    }}
                    testID="report-open-pro"
                  />
                ) : null}
              </SetList>
            </AppSheet>
          </Overlay>
        </>
      }
    >
      <PageHead
        testID="pro-head"
        name={p.name}
        logoUrl={p.logoUrl}
        ring={ring}
        onOpenStories={
          session && (p.stories?.count ?? 0) > 0
            ? () => router.push({ pathname: "/story/[authorKey]", params: { authorKey: key } })
            : undefined
        }
        typeLabel={L.typePro}
        verifiedLabel={p.verified ? L.verifiedPro : null}
        follow={
          <FollowLine
            following={Boolean(p.isFollowing)}
            busy={busy || p.isOwner}
            onPress={() => void toggleFollow()}
            testID="follow-pro"
          />
        }
        bio={p.description}
        side={
          <>
            {hasPosition ? (
              <SideIcon
                icon="nav"
                label={L.route}
                onPress={() => {
                  track("route");
                  void Linking.openURL(`https://www.openstreetmap.org/directions?to=${p.lat}%2C${p.lng}`).catch(
                    () => undefined,
                  );
                }}
                testID="pro-route-icon"
              />
            ) : null}
            <SideIcon icon="more" label={L.more} onPress={() => setMore(true)} testID="page-more" />
          </>
        }
        counters={counters}
      />
      {error ? <Notice tone="error">{error}</Notice> : null}

      {/* Onglets soulignés, collants sous l'en-tête (`StickyHeader`, repéré par l'écran). */}
      <StickyHeader style={[styles.tabsBar, { backgroundColor: t.color.ground }]}>
        <PageTabs value={tab} onChange={setPicked} items={tabs} />
      </StickyHeader>

      {tab === "presentation" ? (
        <ProPresentation pro={p} onOpenPhoto={setViewer} onTrack={track} session={session} />
      ) : tab === "offers" ? (
        <PageOffers
          reloadToken={reloadToken}
          authorKey={key}
          pro={p}
          owner={owner}
          onPublish={() => router.push({ pathname: "/fil/publier", params: { fiche: p.id, etiquette: "offre" } })}
        />
      ) : tab === "publications" ? (
        <PagePublications
          reloadToken={reloadToken}
          authorKey={key}
          name={p.name}
          withFilter={false}
          filter="all"
          onFilter={() => undefined}
          total={pagePublicationsCount(p) ?? null}
          session={session}
        />
      ) : (
        <PageMentions
          reloadToken={reloadToken}
          pageKey={key}
          pageName={p.name}
          manage={owner}
          onHiddenChange={(d) => setMentionsDelta((v) => v + d)}
        />
      )}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  tabsBar: { marginHorizontal: -space4, paddingHorizontal: space4, paddingBottom: space1 },
});
