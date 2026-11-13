// L'onglet Le Fil (lot R7e2, D38, maquette R7.6 `p-fil`) : en tête la barre de stories (lot R7f2), puis (lot R8f1, variante A1)
// une rangée : les trois filtres (« Pour toi », « Autour de moi », « Abonnements », mémorisés par compte) et le bouton icône « Publier », puis le fil
// mélangé : une carte par genre, chacune avec sa raison et son « ⋯ ». Mode A (bande ORASSO, barre d'onglets). Liste
// paginée par le curseur de l'API (`useFeed`) ; une erreur n'est jamais une liste vide ; un état vide par filtre.
// Lot R8c2 (maquette R8.3 `f-clair`) : la phrase de l'onglet et le « i » (« Comment le Fil choisit »), le rail « Ça plaît en ce
// moment », le bandeau de ma publication, « Tu es à jour » puis « Déjà vu », la pastille « Nouvelles publications », les cartes
// vues envoyées à l'API, et la copie gardée quand il n'y a pas de réseau.
import { EmptyState, Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  CONTACT_EMAIL,
  casquetteFeedPhrases,
  casquettesLabels,
  caughtUpIndex,
  type FeedCard,
  feedCardKindLabels,
  feedPhrases,
  feedScreenFilters,
  feedScreenLabels as L,
} from "@orasso/shared";
import { useNetworkState } from "expo-network";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { ActorLine } from "@/features/casquettes/ActorLine";
import { confirmRemove } from "@/features/crews/feed/confirm";
import { openReport } from "@/features/ReportSheet";
import { StoriesBar } from "@/features/stories/StoriesBar";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { usePersona } from "@/lib/persona";
import { tabHref } from "@/lib/personaModel";
import { useActor } from "@/lib/useActor";
import { Seg, SmButton } from "@/ui/Kit";
import { LoadError } from "@/ui/LoadError";
import { Notice } from "@/ui/Notice";
import { Overlay } from "@/ui/Overlay";
import { StickyHeader, TabScreen } from "@/ui/Screens";
import { useScrollAssist } from "@/ui/ScrollAssist";
import { Waiting } from "@/ui/Waiting";
import { CardMenu } from "./CardMenu";
import { cardFor } from "./cards";
import { HotRail } from "./HotRail";
import { HowFeedSheet } from "./HowFeedSheet";
import { FilOfflineContext } from "./offlineContext";
import { CardIdContext } from "./openFromCard";
import { noteSeen, useSeenTracker } from "./seenTracker";
import { useFeed } from "./useFeed";
import { WhyThisSheet } from "./WhyThisSheet";

const { space2, space3 } = tokens.spacing;
const FEED_BLOCKS = [200, 260, 200] as const;
/** Plafond de la police système pour les libellés du sélecteur (maquette R8.2 : `data-fsmax="1.12"`). */
const FILTER_MAX_FONT_SCALE = 1.12;

export function FilScreen() {
  return <TabScreenWithFeed />;
}

function TabScreenWithFeed() {
  const feed = useFeed();
  return (
    <TabScreen onRefresh={() => feed.refresh()}>
      {/* La pastille colle en haut de la zone qui défile (enfant direct de la page, sinon elle ne colle pas). */}
      {feed.pill ? (
        <StickyHeader style={styles.pillBox}>
          <FreshPill onPress={() => feed.refresh()} />
        </StickyHeader>
      ) : null}
      <FeedBody feed={feed} />
    </TabScreen>
  );
}

/** « Nouvelles publications » : la toucher actualise et remonte en haut (bouton secondaire : jamais le principal de l'écran). */
function FreshPill({ onPress }: { onPress: () => Promise<void> }) {
  const assist = useScrollAssist();
  return (
    <SmButton
      kind="s"
      icon="up"
      onPress={() => {
        void onPress().then(() => assist?.top());
      }}
      testID="fil-fresh"
    >
      {L.freshPill}
    </SmButton>
  );
}

function FeedBody({ feed }: { feed: ReturnType<typeof useFeed> }) {
  const { t } = useTheme();
  const router = useRouter();
  const assist = useScrollAssist();
  const [menu, setMenu] = useState<FeedCard | null>(null);
  const [why, setWhy] = useState<FeedCard | null>(null);
  // « Moins de ce genre » : la carte s'estompe tout de suite, avec un « Annuler » ; le Fil affiché ne bouge pas.
  const [faded, setFaded] = useState<Record<string, FeedCard>>({});
  const [lessNote, setLessNote] = useState<{ card: FeedCard; error: string | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Lot R9n : en casquette, le Fil est lu « en tant que » la page : sa pastille, les phrases d'« Abonnements » et la casquette
  // de départ de « Publier » (T18 : un seul geste, le segment « Publication | Story » est en haut de l'écran).
  const actor = useActor();
  const { active, persona } = usePersona();
  const followingPhrase = actor ? casquetteFeedPhrases.following(active.label) : null;
  // « Comment le Fil choisit » (le « i » à côté de la phrase).
  const [how, setHow] = useState(false);
  // Le bandeau « Publié sur ton profil » se ferme pour la publication en cours (une nouvelle publication le rouvre).
  const [bannerClosed, setBannerClosed] = useState<string | null>(null);

  // Un `reset` de l'API : la liste a été remplacée, on remonte en haut.
  const lastTop = useRef(feed.scrollTop);
  useEffect(() => {
    if (feed.scrollTop !== lastTop.current) {
      lastTop.current = feed.scrollTop;
      assist?.top();
    }
  }, [feed.scrollTop, assist]);
  // Un autre filtre : les cartes estompées de l'ancienne liste ne comptent plus.
  // biome-ignore lint/correctness/useExhaustiveDependencies: seul le filtre vide les cartes estompées.
  useEffect(() => {
    setFaded({});
    setLessNote(null);
  }, [feed.filter]);

  // Retour du réseau (hors ligne puis en ligne) : une liste en échec se relit ; la copie gardée se remplace par la liste si l'on
  // est en haut, sinon la pastille « Nouvelles publications » le propose (on ne fait pas sauter la lecture).
  const network = useNetworkState();
  const online = network.isConnected !== false && network.isInternetReachable !== false;
  const wasOnline = useRef(online);
  const reload = feed.reload;
  const askPill = feed.askPill;
  const failed = feed.error !== null;
  const offlineCopy = feed.offline;
  const anchor = useRef<View>(null);
  useEffect(() => {
    if (online && !wasOnline.current) {
      if (failed) void reload();
      else if (offlineCopy) {
        const box = anchor.current;
        if (!box || !assist) void reload();
        else
          assist.visibleArea((areaTop) =>
            box.measureInWindow((_x, y) => {
              // En haut de la liste (au plus 36 px défilés) : on relit ; sinon la pastille.
              if (y > areaTop - 36) void reload();
              else askPill();
            }),
          );
      }
    }
    wasOnline.current = online;
  }, [online, failed, offlineCopy, reload, askPill, assist]);

  // Les cartes vues : suivies à l'écran, envoyées par lots .
  const listBox = useRef<View>(null);
  const layouts = useRef(new Map<string, { y: number; h: number }>());
  useSeenTracker({
    list: listBox,
    layouts,
    cards: feed.items ?? [],
    reset: `${feed.filter}:${feed.round}`,
    online,
  });

  const less = useCallback(async (card: FeedCard) => {
    setMenu(null);
    setFaded((f) => ({ ...f, [card.id]: card }));
    setLessNote({ card, error: null });
    try {
      await api.feedLess(card.kind);
    } catch (e) {
      // Pas pris en compte : la carte revient, la raison est dite.
      setFaded((f) => {
        const { [card.id]: _gone, ...rest } = f;
        return rest;
      });
      setLessNote({ card, error: errorMessage(e) });
    }
  }, []);

  const undoLess = useCallback(async (card: FeedCard) => {
    setFaded((f) => {
      const { [card.id]: _gone, ...rest } = f;
      return rest;
    });
    setLessNote(null);
    try {
      await api.feedLessUndo(card.kind);
    } catch (e) {
      setNotice(errorMessage(e));
    }
  }, []);

  const remove = useCallback(
    async (card: FeedCard) => {
      if (card.kind !== "feed_post") return;
      setMenu(null);
      if (!(await confirmRemove(L.removeConfirm))) return;
      try {
        await api.removeFeedPost(card.payload.post.id);
        feed.drop(card.id);
        setNotice(L.removeDone);
      } catch (e) {
        setNotice(errorMessage(e));
      }
    },
    [feed],
  );

  const empty = L.empty[feed.filter];
  const items = feed.items;
  // « Tu es à jour » : avant la première carte déjà vue (hors ligne, rien n'est recalculé : la copie se montre telle quelle).
  const frontier = feed.offline || !items ? -1 : caughtUpIndex(items);
  const showHot = feed.hot.length > 0 && feed.filter !== "for_you";
  const publishedId = feed.published;
  return (
    <FilOfflineContext.Provider value={feed.offline}>
      <View ref={anchor} collapsable={false} style={styles.anchor} />
      <ActorLine />
      <StoriesBar />
      {/* Lot R8f1 (variante A1 de la maquette R8.2) : une seule rangée, le sélecteur prend la place restante et le bouton
          icône « Publier » (le bouton principal de l'écran, 48 px, sans texte) reste à droite. Police agrandie : les
          libellés du sélecteur sont plafonnés à ×1,12 et « Autour de moi » passe sur deux lignes plutôt que de se couper. */}
      <View style={styles.topRow}>
        <View style={styles.topSeg}>
          <Seg
            wrap
            compact
            maxFontScale={FILTER_MAX_FONT_SCALE}
            value={feed.filter}
            onChange={feed.setFilter}
            options={feedScreenFilters.map((o) => ({ value: o.value, label: o.label }))}
            testID="fil-filters"
          />
        </View>
        {/* Lot R9n (tour 1, point 10) : en survol d'une structure (assistance), pas de « Publier » personnel. */}
        {active.assisted ? null : (
          <SmButton
            kind="p"
            big
            icon="camera"
            onPress={() =>
              router.push((actor ? `/fil/publier?auteur=${encodeURIComponent(actor)}` : "/fil/publier") as never)
            }
            testID="fil-publish-open"
            accessibilityLabel={L.publish}
            style={styles.publish}
          />
        )}
      </View>
      {/* Lot R8c2 : la phrase de l'onglet (maquette `r8phr`) et le « i » qui ouvre « Comment le Fil choisit ». */}
      <View style={styles.phrase}>
        <Text variant="caption" color={t.color.inkMuted} style={styles.phraseText} testID="fil-phrase">
          {feed.filter === "following" && followingPhrase ? followingPhrase : feedPhrases[feed.filter]}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={L.howOpen}
          onPress={() => setHow(true)}
          hitSlop={4}
          style={[styles.info, { borderColor: t.color.line }]}
          testID="fil-how-open"
        >
          <Icon name="info" size={20} color={t.color.ink} />
        </Pressable>
      </View>
      {feed.offline ? <Notice testID="fil-offline">{L.offline}</Notice> : null}
      {publishedId && bannerClosed !== publishedId ? (
        <View
          style={[styles.banner, { backgroundColor: t.color.surface, borderColor: t.color.accent }]}
          testID="fil-banner"
        >
          <Icon name="check" size={20} color={t.color.accentText} />
          <View style={styles.bannerBody}>
            <Text variant="caption" color={t.color.ink} style={styles.bannerText}>
              <Text variant="caption" color={t.color.ink} style={styles.bannerTitle}>
                {actor ? casquettesLabels.bannerTitle : L.bannerTitle}
              </Text>
              {L.bannerText}
            </Text>
            <SmButton
              kind="s"
              icon="profile"
              onPress={() =>
                router.push(
                  (actor ? (tabHref(persona.kind, "page") ?? "/profil") : "/profil?onglet=publications") as never,
                )
              }
              testID="fil-banner-profile"
            >
              {actor ? casquettesLabels.bannerLink : L.bannerProfile}
            </SmButton>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={L.bannerClose}
            onPress={() => setBannerClosed(publishedId)}
            hitSlop={6}
            style={styles.bannerClose}
            testID="fil-banner-close"
          >
            <Icon name="close" size={18} color={t.color.inkMuted} />
          </Pressable>
        </View>
      ) : null}
      {showHot ? (
        <HotRail
          cards={feed.hot}
          scope={feed.filter === "nearby" ? "nearby" : "following"}
          scopeLabel={
            feed.filter === "following" && actor ? casquetteFeedPhrases.hotFollowing(active.label) : undefined
          }
          onOpen={(card) => {
            noteSeen(card.id, "open");
            router.push(`/publication/${card.payload.post.id}`);
          }}
        />
      ) : null}
      {notice ? (
        <Text variant="caption" color={t.color.inkMuted} accessibilityRole="alert" selectable testID="fil-notice">
          {notice}
        </Text>
      ) : null}
      {lessNote ? (
        <View style={[styles.less, { backgroundColor: t.color.surface }]} testID="fil-less-note">
          <Text variant="caption" color={t.color.ink} style={styles.lessText}>
            {lessNote.error ?? L.lessKind(feedCardKindLabels[lessNote.card.kind])}
          </Text>
          {lessNote.error ? null : (
            <SmButton kind="g" icon="undo" onPress={() => void undoLess(lessNote.card)} testID="fil-less-undo">
              {L.lessUndo}
            </SmButton>
          )}
        </View>
      ) : null}
      {items === null && !feed.error ? <Waiting blocks={FEED_BLOCKS} testID="fil-waiting" /> : null}
      {feed.error && !items?.length ? (
        <LoadError message={feed.error || L.loadError} onRetry={() => void feed.retry()} />
      ) : null}
      {items && items.length === 0 && !feed.error ? (
        <View style={styles.empty} testID="fil-empty">
          <EmptyState title={empty.title} text={empty.text} />
          {feed.filter === "following" ? (
            <SmButton kind="s" icon="search" wide onPress={() => router.push("/recherche")} testID="fil-empty-search">
              {L.searchPeople}
            </SmButton>
          ) : null}
        </View>
      ) : null}
      {items?.length ? (
        <View ref={listBox} collapsable={false} style={styles.list} testID="fil-list">
          {items.map((card, i) => {
            const Card = cardFor(card.kind);
            return (
              <View
                key={card.id}
                collapsable={false}
                onLayout={(e) =>
                  layouts.current.set(card.id, { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height })
                }
                style={styles.item}
              >
                {i === frontier ? (
                  <>
                    <View
                      style={[styles.upToDate, { backgroundColor: t.color.surface, borderColor: t.color.line }]}
                      accessibilityRole="summary"
                      testID="fil-uptodate"
                    >
                      <Icon name="check" size={26} color={t.color.accentText} />
                      <View style={styles.upToDateBody}>
                        <Text variant="bodyStrong" color={t.color.ink} style={styles.upToDateTitle}>
                          {L.upToDate}
                        </Text>
                        <Text variant="caption" color={t.color.inkMuted} style={styles.upToDateText}>
                          {L.upToDateText}
                        </Text>
                      </View>
                    </View>
                    <Text variant="label" color={t.color.inkMuted} accessibilityRole="header" testID="fil-seen-heading">
                      {L.seenHeading}
                    </Text>
                  </>
                ) : null}
                <View
                  style={frontier >= 0 && i >= frontier ? styles.seenCard : undefined}
                  testID={frontier >= 0 && i >= frontier ? "fil-card-seen" : undefined}
                >
                  <CardIdContext.Provider value={card.id}>
                    <Card
                      card={card}
                      onMenu={setMenu}
                      faded={Boolean(faded[card.id])}
                      onRemoved={(c) => (c.kind === "sponsored" ? feed.dropPlacement(c.payload.id) : feed.drop(c.id))}
                    />
                  </CardIdContext.Provider>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
      {feed.hasMore ? (
        <SmButton
          kind="s"
          wide
          icon="down"
          disabled={feed.loadingMore}
          onPress={() => void feed.loadMore()}
          testID="fil-more"
        >
          {feed.loadingMore ? L.loadingMore : L.loadMore}
        </SmButton>
      ) : null}
      {feed.error && items?.length ? (
        <LoadError message={feed.error || L.moreError} onRetry={() => void feed.retry()} />
      ) : null}
      {items?.length && !feed.hasMore && !feed.error ? (
        <Text variant="caption" color={t.color.inkMuted} style={styles.end} testID="fil-end">
          {L.end}
        </Text>
      ) : null}
      {/* Les feuilles couvrent l'écran : posées dans la zone des feuilles, hors de la liste qui défile. */}
      <Overlay>
        <CardMenu
          card={menu}
          onClose={() => setMenu(null)}
          onWhy={(card) => {
            setMenu(null);
            setWhy(card);
          }}
          onLess={(card) => void less(card)}
          onReport={(card) => {
            setMenu(null);
            if (card.kind === "feed_post") openReport({ type: "feed_post", id: card.payload.post.id });
            // Publicité : pas de cible de modération, un e-mail à l'assistance avec l'annonceur et l'emplacement.
            if (card.kind === "sponsored") {
              const { advertiserName, id } = card.payload;
              const q = [
                `subject=${encodeURIComponent(L.reportAdSubject)}`,
                `body=${encodeURIComponent(L.reportAdBody(advertiserName, id))}`,
              ].join("&");
              // Sans appli de messagerie : l'adresse s'affiche en secours, sélectionnable.
              // La carte est au moins en 4e place : on remonte en haut du Fil, où la note s'affiche.
              void Linking.openURL(`mailto:${CONTACT_EMAIL}?${q}`).catch(() => {
                setNotice(L.reportAdNoMail(CONTACT_EMAIL));
                assist?.top();
              });
            }
          }}
          onRemove={(card) => void remove(card)}
        />
        <WhyThisSheet card={why} onClose={() => setWhy(null)} />
        <HowFeedSheet visible={how} onClose={() => setHow(false)} />
      </Overlay>
    </FilOfflineContext.Provider>
  );
}

const styles = StyleSheet.create({
  list: { gap: space3 },
  item: { gap: space3 },
  // Une carte déjà vue est atténuée (maquette \`r8seen\` : 62 %).
  seenCard: { opacity: 0.62 },
  // Ancre de mesure en haut du contenu : sans hauteur, et sans l'espace que la page met entre deux enfants.
  anchor: { height: 0, marginBottom: -space3 },
  pillBox: { alignItems: "center" },
  phrase: { flexDirection: "row", alignItems: "center", gap: space2 },
  phraseText: { flex: 1, fontSize: 13, lineHeight: 18 },
  info: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: tokens.radius.radiusLg,
    borderWidth: 1.5,
  },
  bannerBody: { flex: 1, gap: space2, alignItems: "flex-start" },
  bannerText: { fontSize: 13.5, lineHeight: 19 },
  bannerTitle: { fontFamily: "Archivo-ExtraBold", fontSize: 13.5, lineHeight: 19 },
  bannerClose: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  upToDate: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: tokens.radius.radiusLg,
    borderWidth: 1.5,
  },
  upToDateBody: { flex: 1, gap: 2 },
  upToDateTitle: { fontSize: 15 },
  upToDateText: { fontSize: 12.5, lineHeight: 17 },
  topRow: { flexDirection: "row", alignItems: "center", gap: space2 },
  topSeg: { flex: 1, minWidth: 0 },
  // Carré au jeton `touch` (48 px), rayon 14 de la maquette ; sans texte, l'icône seule.
  publish: {
    width: tokens.spacing.touch,
    height: tokens.spacing.touch,
    minHeight: tokens.spacing.touch,
    paddingHorizontal: 0,
    borderRadius: 14,
    flexShrink: 0,
    justifyContent: "center",
    alignSelf: "center",
  },
  less: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    paddingLeft: space3,
    borderRadius: tokens.radius.radiusMd,
  },
  lessText: { flex: 1 },
  empty: { gap: space3 },
  end: { textAlign: "center" },
});
