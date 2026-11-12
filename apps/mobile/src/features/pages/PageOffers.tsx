// L'onglet « Offres » de la fiche d'un pro (lot R9c, maquette R9.3 `n-page`, cas `off`) : l'en-tête « N offres en cours » (et, pour le
// propriétaire, « Publier une offre »), une ligne par offre non terminée (vignette, étiquette, titre qui passe à la ligne, légende
// sur deux lignes, dates) qui ouvre la publication, « Pas d'offre en cours. » quand il n'y en a pas, puis « Anciennes offres »
// (les « offres et actualités » d'avant, `pro_posts`, restées à leur place : réservées aux abonnés, déplacées ici, pas dupliquées).
// R9b reprendra cet onglet tel quel dans la « Page » du propriétaire.
import { Icon, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type FeedPostView,
  offerDatesLabel,
  type ProPublic,
  publicationPath,
  proOffersLabels as T,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { CrewPhotoImage } from "@/features/crews/feed/CrewPhotoImage";
import { type FailedCall, retryCall } from "@/features/publications/retryCall";
import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { SmButton } from "@/ui/Kit";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { SectionTitle } from "@/ui/Screens";
import { Waiting } from "@/ui/Waiting";

const { space1, space2, space3 } = tokens.spacing;

type State = { items: FeedPostView[]; next: string | null; loading: boolean; loaded: boolean; error: boolean };

const merge = (list: FeedPostView[], page: FeedPostView[]) => {
  const seen = new Set(list.map((p) => p.id));
  return [...list, ...page.filter((p) => !seen.has(p.id))];
};

/** Les offres non terminées d'une fiche (`filter=offer`), page par page ; une panne n'est jamais « Pas d'offre en cours. ». */
export function useOffers(authorKey: string | null, reloadToken = 0) {
  const [state, setState] = useState<State>({ items: [], next: null, loading: true, loaded: false, error: false });
  const cursor = useRef<string | null>(null);
  const seq = useRef(0);
  const failed = useRef<FailedCall | null>(null);

  const read = useCallback(
    async (first: boolean) => {
      if (!authorKey) return;
      const mine = first ? ++seq.current : seq.current;
      failed.current = null;
      setState((s) => ({ ...s, loading: true, error: false }));
      try {
        const page = await api.authorPosts(authorKey, first ? null : cursor.current, "offer");
        if (mine !== seq.current) return;
        cursor.current = page.nextCursor;
        setState((s) => ({
          items: first ? page.items : merge(s.items, page.items),
          next: page.nextCursor,
          loading: false,
          loaded: true,
          error: false,
        }));
      } catch {
        if (mine !== seq.current) return;
        failed.current = first ? "reload" : "more";
        setState((s) => ({ ...s, loading: false, error: true }));
      }
    },
    [authorKey],
  );

  useEffect(() => {
    cursor.current = null;
    setState({ items: [], next: null, loading: true, loaded: false, error: false });
    void read(true);
    return () => {
      seq.current++;
    };
  }, [read]);

  const seen = useRef(reloadToken);
  // biome-ignore lint/correctness/useExhaustiveDependencies: seul un jeton neuf relit la liste
  useEffect(() => {
    if (seen.current === reloadToken) return;
    seen.current = reloadToken;
    void read(true);
  }, [reloadToken]);

  // Des fonctions stables : un écran peut les mettre dans les dépendances d'un effet de focus sans le relancer à chaque rendu.
  const reload = useCallback(() => read(true), [read]);
  const more = useCallback(() => read(false), [read]);
  const retry = () => (retryCall(failed.current) === "more" ? read(false) : read(true));
  return { ...state, reload, more, retry };
}

/** Une offre : vignette, étiquette, titre (jamais tronqué), légende sur deux lignes, dates. La ligne ouvre la publication. */
export function OfferRow({ post }: { post: FeedPostView }) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const offer = post.offer;
  const photo = post.photos[0];
  if (!offer) return null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${T.openOffer} : ${offer.title}`}
      onPress={() => router.push(publicationPath(post.id) as never)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard },
        pressed && styles.pressed,
      ]}
      testID="offer-row"
    >
      <View style={[styles.thumb, { backgroundColor: c.surfaceRaised }]}>
        {photo ? <CrewPhotoImage url={photo.url} style={styles.thumbImage} resizeMode="cover" /> : null}
      </View>
      <View style={styles.text}>
        <View style={styles.tagRow}>
          <Tag tone="acc">{T.tag}</Tag>
        </View>
        <Text variant="bodyStrong" color={c.ink} testID="offer-title">
          {offer.title}
        </Text>
        {post.caption ? (
          <Muted variant="caption" numberOfLines={2} testID="offer-caption">
            {post.caption}
          </Muted>
        ) : null}
        <View style={styles.dates}>
          <Icon name="calendar" size={14} color={c.inkMuted} />
          <Text variant="caption" color={c.inkMuted} style={styles.datesText} testID="offer-dates">
            {offerDatesLabel(offer)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Les offres en cours (lignes, vide, panne, « Voir plus »), sans en-tête : l'onglet de la fiche et l'espace du pro les posent. */
export function OfferRows({ list }: { list: ReturnType<typeof useOffers> }) {
  if (list.loading && !list.loaded) return <Waiting blocks={[96, 96]} label={T.loading} />;
  if (list.error && !list.loaded) return <LoadError message={T.loadError} onRetry={() => void list.reload()} />;
  if (list.items.length === 0)
    return (
      <Muted variant="body" testID="offers-empty">
        {T.empty}
      </Muted>
    );
  return (
    <View style={styles.list} testID="offers-list">
      {list.items.map((post) => (
        <OfferRow key={post.id} post={post} />
      ))}
      {list.error ? <LoadError message={T.loadError} onRetry={() => void list.retry()} /> : null}
      {list.next && !list.error ? (
        <SmButton
          kind="s"
          wide
          icon="down"
          disabled={list.loading}
          onPress={() => void list.more()}
          testID="offers-more"
        >
          {T.more}
        </SmButton>
      ) : null}
    </View>
  );
}

/** « Anciennes offres » : les `pro_posts` d'avant, lisibles de l'abonné et du propriétaire ; un message pour les autres. */
export function OldOffers({ pro }: { pro: ProPublic }) {
  const { t } = useTheme();
  const c = t.color;
  if (pro.posts === null) {
    if (pro.postsCount <= 0) return null;
    return (
      <View style={styles.old} testID="old-offers">
        <SectionTitle>{T.oldTitle}</SectionTitle>
        <Muted variant="body" testID="old-offers-locked">
          {T.oldLocked(pro.postsCount)}
        </Muted>
      </View>
    );
  }
  if (pro.posts.length === 0) return null;
  return (
    <View style={styles.old} testID="old-offers">
      <SectionTitle>{T.oldTitle}</SectionTitle>
      {pro.posts.map((post) => (
        <View key={post.id} style={[styles.oldRow, { backgroundColor: c.surface }]} testID="old-offer">
          <Text variant="bodyStrong" color={c.ink}>
            {post.title}
          </Text>
          <Text variant="body" color={c.ink}>
            {post.body}
          </Text>
          <Text variant="meta" color={c.inkMuted}>
            {formatDayHour(post.createdAt)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function PageOffers({
  authorKey,
  pro,
  owner,
  onPublish,
  reloadToken,
}: {
  /** `p:<fiche pro>`. */
  authorKey: string;
  pro: ProPublic;
  /** Le propriétaire de la fiche : « Publier une offre ». */
  owner: boolean;
  onPublish: () => void;
  reloadToken?: number;
}) {
  const list = useOffers(authorKey, reloadToken);
  // Le nombre de la liste fait foi une fois lue en entier ; sinon celui que la fiche sert.
  const count = list.loaded && !list.next ? list.items.length : (pro.offers?.current ?? list.items.length);
  return (
    <View style={styles.wrap} testID="page-offers">
      <View style={styles.head}>
        <Text variant="bodyStrong" style={styles.headText} testID="offers-count">
          {T.count(count)}
        </Text>
        {owner ? (
          <SmButton kind="p" icon="ticket" onPress={onPublish} testID="offers-publish">
            {T.publishOffer}
          </SmButton>
        ) : null}
      </View>
      <OfferRows list={list} />
      <OldOffers pro={pro} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space3 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space2, flexWrap: "wrap" },
  headText: { flexShrink: 1 },
  list: { gap: space2 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space3,
    padding: space2,
    borderRadius: tokens.radius.radiusMd,
  },
  pressed: { opacity: 0.8 },
  thumb: { width: 56, height: 70, borderRadius: tokens.radius.radiusSm, overflow: "hidden" },
  thumbImage: { width: 56, height: 70 },
  text: { flex: 1, minWidth: 0, gap: space1 },
  tagRow: { flexDirection: "row" },
  dates: { flexDirection: "row", alignItems: "center", gap: space1 + 2 },
  datesText: { flexShrink: 1 },
  old: { gap: space2 },
  oldRow: { gap: space1, padding: space3, borderRadius: tokens.radius.radiusMd },
});
