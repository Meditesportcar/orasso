// L'onglet Le Fil (lot R7e2, D38, maquette R7.6 `p-fil`) : en tête la barre de stories (lot R7f2), puis (lot R8f1, variante A1)
// une rangée : les trois filtres (« Pour toi », « Autour de moi », « Abonnements », mémorisés par compte) et le bouton icône « Publier », puis le fil
// mélangé : une carte par genre, chacune avec sa raison et son « ⋯ ». Mode A (bande ORASSO, barre d'onglets). Liste
// paginée par le curseur de l'API (`useFeed`) ; une erreur n'est jamais une liste vide ; un état vide par filtre.
import { EmptyState, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  CONTACT_EMAIL,
  type FeedCard,
  feedCardKindLabels,
  feedScreenFilters,
  feedScreenLabels as L,
} from "@orasso/shared";
import { useNetworkState } from "expo-network";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { confirmRemove } from "@/features/crews/feed/confirm";
import { openReport } from "@/features/ReportSheet";
import { StoriesBar } from "@/features/stories/StoriesBar";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { Seg, SmButton } from "@/ui/Kit";
import { LoadError } from "@/ui/LoadError";
import { Overlay } from "@/ui/Overlay";
import { TabScreen } from "@/ui/Screens";
import { useScrollAssist } from "@/ui/ScrollAssist";
import { Waiting } from "@/ui/Waiting";
import { CardMenu } from "./CardMenu";
import { cardFor } from "./cards";
import { PublishChoice } from "./PublishChoice";
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
    <TabScreen onRefresh={() => feed.reload()}>
      <FeedBody feed={feed} />
    </TabScreen>
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
  // « Publier » demande où : en story (9:16, 24 h) ou dans le Fil (4:5).
  const [choosing, setChoosing] = useState(false);

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

  // Retour du réseau (hors ligne puis en ligne) : une liste en échec se relit.
  const network = useNetworkState();
  const online = network.isConnected !== false && network.isInternetReachable !== false;
  const wasOnline = useRef(online);
  const reload = feed.reload;
  const failed = feed.error !== null;
  useEffect(() => {
    if (online && !wasOnline.current && failed) void reload();
    wasOnline.current = online;
  }, [online, failed, reload]);

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
  return (
    <>
      <StoriesBar />
      {/* Lot R8f1 (variante A1 de la maquette R8.2) : une seule rangée, le sélecteur prend la place restante et le bouton
          icône « Publier » (le bouton principal de l'écran, 48 px, sans texte) reste à droite. Police agrandie : les
          libellés du sélecteur sont plafonnés à ×1,12 et « Autour de moi » passe sur deux lignes plutôt que de se couper. */}
      <View style={styles.topRow}>
        <View style={styles.topSeg}>
          <Seg
            wrap
            maxFontScale={FILTER_MAX_FONT_SCALE}
            value={feed.filter}
            onChange={feed.setFilter}
            options={feedScreenFilters.map((o) => ({ value: o.value, label: o.label }))}
            testID="fil-filters"
          />
        </View>
        <SmButton
          kind="p"
          big
          icon="camera"
          onPress={() => setChoosing(true)}
          testID="fil-publish-open"
          accessibilityLabel={L.publish}
          style={styles.publish}
        />
      </View>
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
        <View style={styles.list} testID="fil-list">
          {items.map((card) => {
            const Card = cardFor(card.kind);
            return (
              <Card
                key={card.id}
                card={card}
                onMenu={setMenu}
                faded={Boolean(faded[card.id])}
                onRemoved={(c) => (c.kind === "sponsored" ? feed.dropPlacement(c.payload.id) : feed.drop(c.id))}
              />
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
        <PublishChoice visible={choosing} onClose={() => setChoosing(false)} />
      </Overlay>
    </>
  );
}

const styles = StyleSheet.create({
  list: { gap: space3 },
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
