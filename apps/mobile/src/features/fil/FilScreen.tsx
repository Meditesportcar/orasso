// L'onglet Le Fil (lot R7e2, D38, maquette R7.6 `p-fil`) : en tête l'emplacement de la barre de stories (lot R7f2), le
// bouton « Publier », les trois filtres (« Pour toi », « Autour de moi », « Abonnements », mémorisés par compte), puis le fil
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
import { StoriesBarSlot } from "./StoriesBarSlot";
import { useFeed } from "./useFeed";
import { WhyThisSheet } from "./WhyThisSheet";

const { space2, space3 } = tokens.spacing;
const FEED_BLOCKS = [200, 260, 200] as const;

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
      <StoriesBarSlot />
      <SmButton
        kind="p"
        big
        wide
        icon="camera"
        onPress={() => router.push("/fil/publier")}
        testID="fil-publish-open"
        accessibilityLabel={L.publishTitle}
      >
        {L.publish}
      </SmButton>
      {/* Le sélecteur segmenté de la maquette ; police agrandie : le segment grandit, le libellé passe sur deux lignes. */}
      <Seg
        wrap
        value={feed.filter}
        onChange={feed.setFilter}
        options={feedScreenFilters.map((o) => ({ value: o.value, label: o.label }))}
        testID="fil-filters"
      />
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
              void Linking.openURL(`mailto:${CONTACT_EMAIL}?${q}`).catch(() =>
                setNotice(L.reportAdNoMail(CONTACT_EMAIL)),
              );
            }
          }}
          onRemove={(card) => void remove(card)}
        />
        <WhyThisSheet card={why} onClose={() => setWhy(null)} />
      </Overlay>
    </>
  );
}

const styles = StyleSheet.create({
  list: { gap: space3 },
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
