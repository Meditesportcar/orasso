// La page d'un prestataire (`/providers/<id>`) ou d'un média (`/m/<id>`) vue de l'extérieur (lot R9b, maquette R9.3 `n-page`, vue « Un
// visiteur »), au gabarit de la page d'une structure et de la fiche d'un pro (R8g) : le logo dans l'anneau de ses stories, le nom (jamais
// tronqué), le type, « Suivre » (le seul bouton principal) ou « Suivi », la bio sur une ligne, « Plus » (Partager, Signaler pour un
// prestataire) ; la bande de trois compteurs ; puis « Publications » (ouvert par défaut quand il y en a), « Prestations » (la vitrine
// d'aujourd'hui) ou « Contenus » (ses liens et galeries publics), « Mentions · N ». « Suivre » écrit l'abonnement de la casquette
// active : en casquette, **c'est la page qui suit** (`actor`, T6 et T14), jamais la personne. Le propriétaire qui ouvre sa propre page
// voit les mêmes onglets, sans « Suivre », avec « Modifier » dans « Plus » qui le ramène à sa casquette. Les deux routes de l'API
// exigent un compte : sans session, la page propose de se connecter.
import { tokens, useTheme } from "@orasso/design-system/native";
import {
  authorKeyOf,
  explicitPageTab,
  isOwnPage,
  pagesLabels as L,
  type MediaPage,
  type PageKind,
  type PageTab,
  type ProviderPage,
  pageCounters,
  pageMentionsCount,
  pageOpenTab,
  pagePublicationsCount,
  pageTabs,
  profileRingState,
  proV2Labels,
  type WithPageExtras,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Share, StyleSheet } from "react-native";

import { siteUrl } from "@/api";
import { FollowLine, PageHead } from "@/features/pages/PageHead";
import { PageMentions } from "@/features/pages/PageMentions";
import { PagePublications } from "@/features/pages/PagePublications";
import { PageTabs } from "@/features/pages/PageTabs";
import { SideIcon } from "@/features/profil/ProfileHead";
import { SetList, SetRow } from "@/features/profil/parts";
import { openReport } from "@/features/ReportSheet";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { usePersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import { useActor } from "@/lib/useActor";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { SmButton } from "@/ui/Kit";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { Overlay } from "@/ui/Overlay";
import { FlowScreen, StickyHeader } from "@/ui/Screens";
import { PageAlbums } from "./PageAlbums";
import { PagePrestations } from "./PagePrestations";
import { useReloadToken } from "./useReloadToken";

const { space1, space4 } = tokens.spacing;

type VisitedKind = "provider" | "media";

export function VisitedPage({ kind }: { kind: VisitedKind }) {
  const { t } = useTheme();
  const router = useRouter();
  const { id, onglet } = useLocalSearchParams<{ id: string; onglet?: string }>();
  const { status, me } = useSession();
  const { choose } = usePersona();
  const session = status === "in";
  const actor = useActor();
  const pageKind: PageKind = kind;
  const page = useApi<WithPageExtras<ProviderPage> | WithPageExtras<MediaPage>>(
    () =>
      kind === "provider"
        ? (api.providerById(id, actor) as Promise<WithPageExtras<ProviderPage>>)
        : (api.mediaById(id, actor) as Promise<WithPageExtras<MediaPage>>),
    [kind, id, actor, status],
    { enabled: session },
  );
  const p = page.data;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [picked, setPicked] = useState<PageTab | null>(null);
  const [mentionsDelta, setMentionsDelta] = useState(0);
  const [reloadToken, bumpReload] = useReloadToken();
  const mentionsBase = p ? pageMentionsCount(p) : undefined;
  // Le nombre servi fait foi : la correction locale (masqué ou remis) repart de zéro à chaque réponse servie neuve.
  // biome-ignore lint/correctness/useExhaustiveDependencies: chaque réponse servie neuve remet le delta à zéro
  useEffect(() => setMentionsDelta(0), [p, id]);

  // `?onglet=` s'applique à chaque navigation ; une fois lu, on le retire.
  useEffect(() => {
    if (onglet === undefined) return;
    const asked = explicitPageTab(pageKind, onglet, session);
    if (asked) setPicked(asked);
    router.setParams({ onglet: undefined });
  }, [onglet, router, session, pageKind]);

  const close = () => (router.canGoBack() ? router.back() : router.replace(session ? "/" : "/auth"));
  const here = kind === "provider" ? `/providers/${id}` : `/m/${id}`;

  if (!session || !p) {
    return (
      <FlowScreen title={kind === "provider" ? proV2Labels.providerPage : L.typeMedia} onClose={close}>
        {!session && status !== "loading" ? (
          <>
            <Muted variant="body">{L.signInToSee}</Muted>
            <SmButton
              kind="p"
              icon="profile"
              onPress={() => router.push({ pathname: "/auth", params: { mode: "signup", next: here } })}
              testID="page-sign-in"
            >
              {L.signIn}
            </SmButton>
          </>
        ) : page.error ? (
          <Notice tone="error">
            {page.error.status === 404
              ? kind === "provider"
                ? proV2Labels.providerMissing
                : L.mediaMissing
              : page.error.message}
          </Notice>
        ) : (
          <Muted variant="body">Chargement…</Muted>
        )}
      </FlowScreen>
    );
  }

  const owner = Boolean(
    me?.personas?.some((e) => e.kind === (kind === "provider" ? "provider" : "media") && e.id === p.id),
  );
  const key = authorKeyOf(kind, p.id);
  // « Suivre » : masqué seulement si la casquette active **est** la page visitée ; sans casquette, le propriétaire ne se suit pas
  // lui-même (même règle que le site, `isOwnPage`). La structure du compte peut suivre sa vitrine ou son média.
  const selfPage = isOwnPage({ actorKey: actor, pageKey: key, owner });
  const mentionsCount = mentionsBase === undefined ? undefined : Math.max(0, mentionsBase + mentionsDelta);
  const tabs = pageTabs(pageKind, { session, mentionsCount });
  const wanted = picked ?? pageOpenTab(pageKind, { publications: pagePublicationsCount(p) }, session);
  const tab = tabs.some((x) => x.id === wanted) ? wanted : (tabs[0]?.id ?? "publications");
  const counters =
    kind === "provider"
      ? pageCounters("provider", {
          followers: p.followersCount,
          missions: (p as ProviderPage).missionsCount ?? null,
          organizers: (p as ProviderPage).organizersCount ?? null,
        })
      : pageCounters("media", {
          followers: p.followersCount,
          albums: (p as MediaPage).albumsCount ?? null,
          photos: (p as MediaPage).photosCount ?? null,
        });
  const provider = kind === "provider" ? (p as ProviderPage) : null;
  const media = kind === "media" ? (p as MediaPage) : null;

  async function toggleFollow() {
    if (!p) return;
    setBusy(true);
    setNote(null);
    try {
      const done = p.isFollowing ? await api.unfollowPage(key, actor) : await api.followPage(key, actor);
      // La réponse de l'écriture est appliquée tout de suite ; la relecture se fait en arrière-plan (sa panne ne défait rien).
      page.setData({ ...p, isFollowing: done.following, followersCount: done.followersCount });
      void page.reload().catch(() => undefined);
    } catch (e) {
      setNote(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FlowScreen
      title={p.name}
      onClose={close}
      onRefresh={async () => {
        bumpReload();
        await page.reload();
      }}
      overlays={
        <Overlay>
          <AppSheet visible={more} onClose={() => setMore(false)} accessibilityLabel={L.moreTitle}>
            <SetList>
              <SetRow
                first
                icon="share"
                title={L.share}
                onPress={() => {
                  setMore(false);
                  void Share.share({ message: siteUrl(here) }).catch(() => undefined);
                }}
                testID="page-share"
              />
              {owner ? (
                <SetRow
                  icon="edit"
                  title={L.edit}
                  onPress={() => {
                    setMore(false);
                    if (kind === "provider") choose({ kind: "provider" }, "/(provider)/page");
                    else choose({ kind: "media", mediaProfileId: p.id }, "/(media)/page");
                  }}
                  testID="page-edit"
                />
              ) : null}
              {provider && !owner ? (
                <SetRow
                  icon="flag"
                  title={L.reportProvider}
                  onPress={() => {
                    setMore(false);
                    openReport({ type: "provider", id: p.id });
                  }}
                  testID="report-open-provider"
                />
              ) : null}
            </SetList>
          </AppSheet>
        </Overlay>
      }
    >
      <PageHead
        testID={`${kind}-head`}
        name={p.name}
        logoUrl={media ? media.logoUrl : null}
        ring={profileRingState(p.stories)}
        onOpenStories={
          (p.stories?.count ?? 0) > 0
            ? () => router.push({ pathname: "/story/[authorKey]", params: { authorKey: key } })
            : undefined
        }
        typeLabel={provider ? provider.typeLabel || L.typeProvider : L.typeMedia}
        verifiedLabel={media?.verified ? L.verifiedMedia : null}
        follow={
          selfPage ? null : (
            <FollowLine
              following={Boolean(p.isFollowing)}
              busy={busy}
              onPress={() => void toggleFollow()}
              testID={`follow-${kind}`}
            />
          )
        }
        bio={p.description}
        side={<SideIcon icon="more" label={L.more} onPress={() => setMore(true)} testID="page-more" />}
        counters={counters}
        onCounter={(k) => setPicked(k === "publications" ? "publications" : null)}
      />
      {note ? <Notice tone="error">{note}</Notice> : null}

      {/* Onglets soulignés, collants sous l'en-tête (`StickyHeader`, repéré par l'écran). */}
      <StickyHeader style={[styles.tabsBar, { backgroundColor: t.color.ground }]}>
        <PageTabs value={tab} onChange={setPicked} items={tabs} />
      </StickyHeader>

      {tab === "services" && provider ? (
        <PagePrestations provider={provider} />
      ) : tab === "albums" && media ? (
        <PageAlbums mediaId={media.id} owner={false} reloadToken={reloadToken} />
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
