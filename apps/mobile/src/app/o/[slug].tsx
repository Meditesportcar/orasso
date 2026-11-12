// Page d'une structure (organisateur) dans l'appli (lot 29, docs/02 « Pages atteintes »), vue d'un visiteur.
// Lot R8g (D40, maquettes R8.6 `pu-publi` et R9.3 `n-page`) : le haut compact du Profil (logo dans l'anneau de ses stories, nom,
// type et vérification, « Suivre », bio sur une ligne, icônes « Message » et « Plus », trois compteurs) puis des onglets
// soulignés et collants : « Événements » (ce que la page montrait), « Publications » (les siennes, filtre « Tout · Événements ·
// Hors événement », ouvert par défaut), « Mentions · N » (ceux qui la citent). Sans session : « Événements » et « Publications »
// seulement. Ouverte sans compte (lien partagé) ; suivre, écrire ou devenir staff demandent de se connecter. `?onglet=` ouvre un
// onglet précis (un lien partagé).

import { tokens, useTheme } from "@orasso/design-system/native";
import {
  authorKeyOf,
  type EventCard,
  explicitPageTab,
  explorerLabels,
  isPageManager,
  pagesLabels as L,
  type PageTab,
  type ProCard,
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
import { useEffect, useRef, useState } from "react";
import { Linking, Share, StyleSheet } from "react-native";
import { siteUrl } from "@/api";
import { FollowLine, PageHead } from "@/features/pages/PageHead";
import { PageMentions } from "@/features/pages/PageMentions";
import { PagePublications } from "@/features/pages/PagePublications";
import { PageTabs } from "@/features/pages/PageTabs";
import { StructureEvents } from "@/features/pages/StructureEvents";
import { useReloadToken } from "@/features/pages/useReloadToken";
import { SideIcon } from "@/features/profil/ProfileHead";
import { SetList, SetRow } from "@/features/profil/parts";
import { api } from "@/lib/api";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { Overlay } from "@/ui/Overlay";
import { FlowScreen, StickyHeader } from "@/ui/Screens";

const { space1, space4 } = tokens.spacing;

export default function StructurePage() {
  const { t } = useTheme();
  const router = useRouter();
  const { slug, onglet } = useLocalSearchParams<{ slug: string; onglet?: string }>();
  const { status, me } = useSession();
  const session = status === "in";
  const structure = useApi(() => api.structureBySlug(slug), [slug, status], { enabled: status !== "loading" });
  const s = structure.data as WithPageExtras<StructurePublic> | null;
  // Les listes de l'onglet « Événements » ; `null` tant qu'elles ne sont pas lues (une panne n'est jamais « aucun »).
  const upcoming = useApi(() => api.exploreEvents({ structureId: s?.id, sort: "date", limit: 50 }), [s?.id], {
    enabled: Boolean(s),
  });
  const past = useApi(() => api.exploreEvents({ structureId: s?.id, scope: "past", limit: 12 }), [s?.id], {
    enabled: Boolean(s),
  });
  const partners = useApi(() => api.structurePros(slug), [slug], { enabled: Boolean(s) });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [more, setMore] = useState(false);
  // Un double toucher sur « Message » n'ouvre qu'une conversation.
  const contacting = useRef(false);
  const [picked, setPicked] = useState<PageTab | null>(null);
  const [filter, setFilter] = useState<"all" | "event" | "no_event">("all");
  const [mentionsDelta, setMentionsDelta] = useState(0);
  // Tirer pour recharger et revenir sur l'écran relisent aussi les publications et les mentions.
  const mentionsBase = s ? pageMentionsCount(s) : undefined;
  // Le nombre servi fait foi : la correction locale (masqué ou remis) repart de zéro à chaque réponse servie neuve (même valeur comprise).
  // biome-ignore lint/correctness/useExhaustiveDependencies: chaque réponse servie neuve remet le delta à zéro
  useEffect(() => setMentionsDelta(0), [s, slug]);
  const [reloadToken, bumpReload] = useReloadToken();

  // `?onglet=` s'applique à chaque navigation ; une fois lu, on le retire.
  useEffect(() => {
    if (onglet === undefined) return;
    const asked = explicitPageTab("structure", onglet, session);
    if (asked) setPicked(asked);
    router.setParams({ onglet: undefined });
  }, [onglet, router, session]);

  const close = () => (router.canGoBack() ? router.back() : router.replace(status === "in" ? "/" : "/auth"));
  const needAccount = () => router.push({ pathname: "/auth", params: { mode: "signup", next: `/o/${slug}` } });

  if (!s) {
    return (
      <FlowScreen title="Organisateur" onClose={close}>
        {structure.error ? (
          <Notice tone="error">
            {structure.error.status === 404 ? explorerLabels.structureMissing : structure.error.message}
          </Notice>
        ) : (
          <Muted variant="body">Chargement…</Muted>
        )}
      </FlowScreen>
    );
  }

  async function toggleFollow() {
    if (!s) return;
    if (!session) return needAccount();
    setBusy(true);
    setNote(null);
    try {
      if (s.isFollowing) await api.unfollowStructure(s.id);
      else await api.followStructure(s.id);
      await structure.reload();
    } catch (e) {
      setNote({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function becomeStaff() {
    if (!s) return;
    setMore(false);
    if (!session) return needAccount();
    setBusy(true);
    setNote(null);
    try {
      await api.requestStaff(s.id);
      setNote({
        tone: "info",
        text: `Demande envoyée à ${s.name}. Tu seras prévenu quand l'équipe organisatrice aura répondu.`,
      });
    } catch (e) {
      if (e instanceof ApiRequestError && (e.status === 404 || e.status === 405)) {
        // La demande depuis l'appli n'existe pas encore (lot 24) : la page de la structure du site la reçoit.
        setNote({
          tone: "info",
          text: "La demande se fait pour l'instant depuis la page de la structure sur le site.",
        });
        void Linking.openURL(siteUrl(`/o/${s.slug}`)).catch(() => undefined);
      } else {
        setNote({ tone: "error", text: errorMessage(e) });
      }
    } finally {
      setBusy(false);
    }
  }

  // « Message » : la conversation avec l'équipe organisatrice (la même que « Contacter l'organisateur » du site).
  async function contact() {
    if (!s) return;
    if (!session) return needAccount();
    if (contacting.current) return;
    contacting.current = true;
    setNote(null);
    try {
      const { id } = await api.contactStructure(s.id);
      router.push(`/messages/${id}`);
    } catch (e) {
      setNote({ tone: "error", text: errorMessage(e) });
    } finally {
      contacting.current = false;
    }
  }

  const isOrganizer = isPageManager("structure", { structureId: s.id, memberships: me?.memberships });
  const mentionsCount = mentionsBase === undefined ? undefined : Math.max(0, mentionsBase + mentionsDelta);
  const tabs = pageTabs("structure", { session, mentionsCount });
  const wanted = picked ?? pageOpenTab("structure", { publications: pagePublicationsCount(s) }, session);
  const tab = tabs.some((x) => x.id === wanted) ? wanted : (tabs[0]?.id ?? "events");
  // Le nombre n'est dit que quand les deux listes sont lues en entier (pas de page suivante) : jamais un plancher présenté comme un total.
  const eventsRead =
    upcoming.data && past.data && !upcoming.data.nextCursor && !past.data.nextCursor
      ? upcoming.data.items.length + past.data.items.length
      : null;
  const counters = pageCounters("structure", {
    followers: s.followersCount,
    events: eventsRead,
    partners: partners.data ? partners.data.length : null,
  });
  const key = authorKeyOf("structure", s.id);
  const ring = session ? profileRingState(s.stories) : null;
  const upcomingItems: EventCard[] | null = upcoming.data ? upcoming.data.items : null;
  const pastItems: EventCard[] | null = past.data ? past.data.items : null;
  const partnerItems: ProCard[] | null = partners.data ?? null;

  return (
    <FlowScreen
      title={s.name}
      onClose={close}
      onRefresh={async () => {
        bumpReload();
        await Promise.all([structure.reload(), upcoming.reload(), past.reload(), partners.reload()]);
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
                  void Share.share({ message: siteUrl(`/o/${s.slug}`) }).catch(() => undefined);
                }}
                testID="page-share"
              />
              {s.verified && !isOrganizer ? (
                <SetRow
                  icon="staff"
                  title={explorerLabels.structureBecomeStaff}
                  onPress={() => void becomeStaff()}
                  testID="become-staff"
                />
              ) : null}
            </SetList>
          </AppSheet>
        </Overlay>
      }
    >
      <PageHead
        testID="structure-head"
        name={s.name}
        logoUrl={s.logoUrl}
        ring={ring}
        onOpenStories={
          session && (s.stories?.count ?? 0) > 0
            ? () => router.push({ pathname: "/story/[authorKey]", params: { authorKey: key } })
            : undefined
        }
        typeLabel={L.typeStructure}
        verifiedLabel={s.verified ? L.verifiedStructure : null}
        follow={
          <FollowLine
            following={Boolean(s.isFollowing)}
            busy={busy}
            onPress={() => void toggleFollow()}
            testID="follow"
          />
        }
        bio={s.description}
        side={
          <>
            {s.verified && !isOrganizer ? (
              <SideIcon icon="chat" label={L.message} onPress={() => void contact()} testID="contact-organizer" />
            ) : null}
            <SideIcon icon="more" label={L.more} onPress={() => setMore(true)} testID="page-more" />
          </>
        }
        counters={counters}
        onCounter={() => setPicked("events")}
      />
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}

      {/* Onglets soulignés, collants sous l'en-tête (`StickyHeader`, repéré par l'écran). */}
      <StickyHeader style={[styles.tabsBar, { backgroundColor: t.color.ground }]}>
        <PageTabs value={tab} onChange={setPicked} items={tabs} />
      </StickyHeader>

      {tab === "events" ? (
        <StructureEvents structure={s} upcoming={upcomingItems} past={pastItems} partners={partnerItems} />
      ) : tab === "publications" ? (
        <PagePublications
          reloadToken={reloadToken}
          authorKey={key}
          name={s.name}
          withFilter
          filter={filter}
          onFilter={setFilter}
          total={pagePublicationsCount(s) ?? null}
          session={session}
        />
      ) : (
        <PageMentions
          reloadToken={reloadToken}
          pageKey={key}
          pageName={s.name}
          manage={isOrganizer}
          onHiddenChange={(d) => setMentionsDelta((v) => v + d)}
        />
      )}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  tabsBar: { marginHorizontal: -space4, paddingHorizontal: space4, paddingBottom: space1 },
});
