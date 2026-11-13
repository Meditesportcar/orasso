// L'onglet « Albums » de la page d'un média (lot R9e, maquette R9.5 `ALBS` ; remplace « Contenus » de R9b) : les albums (vignette, titre jamais
// tronqué, « N photos », date), puis « Liens » (T8 : les liens d'avant, gérés par le propriétaire comme avant). Propriétaire : « Nouvel album »
// en tête (le seul bouton principal de l'onglet), ses brouillons (« Brouillon ») s'y reprennent ; vide : « Pas encore d'album. ». Visiteur :
// les albums publiés (`GET /media/:id/albums`) et les liens publics. Après l'échec d'une actualisation d'une liste remplie, « Réessayer »
// rejoue une **actualisation** (`read(true)`), jamais une suite fusionnée (R9b).
import { Button, Chip, Icon, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type AlbumSummary, albumLabels as L, mediaAppLabels as M, type MediaContentView } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { AlbumPhoto } from "@/features/albums/AlbumPhoto";
import { ContentsScreen } from "@/features/media/ContentsScreen";
import { contentCaption } from "@/features/media/model";
import { api } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { SmButton } from "@/ui/Kit";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Waiting } from "@/ui/Waiting";

const { space1, space2, space3, space12 } = tokens.spacing;

type State = {
  items: AlbumSummary[];
  next: string | null;
  loaded: boolean;
  loading: boolean;
  error: string | null;
};

export function PageAlbums({
  mediaId,
  owner,
  reloadToken = 0,
}: {
  mediaId: string;
  owner: boolean;
  /** Change quand la Page est tirée pour recharger. */
  reloadToken?: number;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>({ items: [], next: null, loaded: false, loading: true, error: null });
  const seq = useRef(0);
  const cursor = useRef<string | null>(null);

  const read = useCallback(
    async (first: boolean) => {
      const mine = first ? ++seq.current : seq.current;
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const page = owner
          ? await api.myAlbums(first ? null : cursor.current)
          : await api.mediaAlbums(mediaId, first ? null : cursor.current);
        if (mine !== seq.current) return;
        cursor.current = page.nextCursor;
        setState((s) => ({
          items: first ? page.items : [...s.items, ...page.items.filter((p) => !s.items.some((x) => x.id === p.id))],
          next: page.nextCursor,
          loaded: true,
          loading: false,
          error: null,
        }));
      } catch (e) {
        if (mine !== seq.current) return;
        setState((s) => ({ ...s, loading: false, error: errorMessage(e) }));
      }
    },
    [mediaId, owner],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: le jeton relit la liste, sans la démonter
  useEffect(() => {
    cursor.current = null;
    void read(true);
    return () => {
      seq.current++;
    };
  }, [read, reloadToken]);

  return (
    <View style={styles.block} testID="page-albums">
      {owner ? (
        <Button
          variant="primary"
          icon="add"
          fullWidth
          onPress={() => router.push("/album/nouveau" as never)}
          testID="page-album-new"
        >
          {L.newAlbum}
        </Button>
      ) : null}
      {!state.loaded && state.loading ? <Waiting blocks={[72, 72]} label="Chargement…" /> : null}
      {!state.loaded && state.error ? <LoadError message={state.error} onRetry={() => void read(true)} /> : null}
      {state.loaded && state.items.length === 0 ? (
        <Muted variant="body" testID="page-albums-empty">
          {L.empty}
        </Muted>
      ) : null}
      {state.items.map((a) => (
        <AlbumRow key={a.id} album={a} onPress={() => router.push(`/album/${a.id}` as never)} />
      ))}
      {state.loaded && state.error ? (
        // Une actualisation qui échoue sur une liste remplie : « Réessayer » actualise (jamais une suite fusionnée).
        <LoadError message={state.error} onRetry={() => void read(true)} />
      ) : null}
      {state.next && !state.error ? (
        <SmButton
          kind="s"
          wide
          icon="down"
          disabled={state.loading}
          onPress={() => void read(false)}
          testID="page-albums-more"
        >
          {L.loadMore}
        </SmButton>
      ) : null}
      <Links mediaId={mediaId} owner={owner} reloadToken={reloadToken} />
    </View>
  );
}

function AlbumRow({ album, onPress }: { album: AlbumSummary; onPress: () => void }) {
  const { t } = useTheme();
  const cover = album.cover[0];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${album.title}, ${L.photosCount(album.photosCount)}`}
      onPress={onPress}
      style={[styles.row, { backgroundColor: t.color.surface, borderColor: t.color.line }]}
      testID="page-album"
    >
      <View style={[styles.thumb, { backgroundColor: t.color.night }]}>
        {cover ? <AlbumPhoto photo={cover} style={styles.img} cover /> : null}
      </View>
      <View style={styles.text}>
        <Text variant="bodyStrong" color={t.color.ink} testID="page-album-title">
          {album.title}
        </Text>
        <View style={styles.meta}>
          <Icon name="gallery" size={14} color={t.color.inkMuted} />
          <Muted variant="caption">{L.photosCount(album.photosCount)}</Muted>
          <Muted variant="caption">{`· ${formatDay(album.publishedAt ?? album.event.startsAt)}`}</Muted>
        </View>
        {album.status === "draft" ? (
          <Chip surface="plate" selected>
            {L.draft}
          </Chip>
        ) : album.official ? (
          <Chip surface="plate" selected>
            {L.officialAlbum}
          </Chip>
        ) : null}
      </View>
    </Pressable>
  );
}

/** « Liens » (T8) : le propriétaire garde la gestion d'aujourd'hui (`ContentsScreen`, liens seulement) ; un visiteur lit les liens publics. */
function Links({ mediaId, owner, reloadToken }: { mediaId: string; owner: boolean; reloadToken: number }) {
  if (owner) {
    return (
      <View style={styles.links} testID="page-links">
        <Text variant="title" accessibilityRole="header">
          {L.links}
        </Text>
        <ContentsScreen embedded linksOnly reloadToken={reloadToken} />
      </View>
    );
  }
  return <PublicLinks mediaId={mediaId} reloadToken={reloadToken} />;
}

function PublicLinks({ mediaId, reloadToken }: { mediaId: string; reloadToken: number }) {
  const { t } = useTheme();
  const [links, setLinks] = useState<MediaContentView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api
      .mediaLinks(mediaId)
      .then(setLinks)
      .catch((e) => setError(errorMessage(e)));
  }, [mediaId]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: le jeton relit la liste
  useEffect(load, [load, reloadToken]);
  if (error && !links) return <LoadError message={error} onRetry={load} />;
  if (!links?.length) return null;
  return (
    <View style={styles.links} testID="page-links">
      <Text variant="title" accessibilityRole="header">
        {L.links}
      </Text>
      {links.map((c) => (
        <Pressable
          key={c.id}
          accessibilityRole="link"
          accessibilityLabel={`${M.kindOf(c)}, ${c.title}`}
          onPress={() => {
            void api.viewMediaContent(c.id).catch(() => undefined);
            if (c.url) void Linking.openURL(c.url).catch(() => undefined);
          }}
          testID="page-link"
        >
          <Plate style={styles.link}>
            <Text variant="bodyStrong" color={t.color.plateInk}>
              {`${M.kindOf(c)} · ${c.title}`}
            </Text>
            <Text variant="meta" color={t.color.plateMuted}>
              {`${c.event.title} · ${contentCaption(c)}`}
            </Text>
          </Plate>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2 },
  row: { flexDirection: "row", gap: space3, borderWidth: 1, borderRadius: tokens.radius.radiusMd, padding: space2 },
  thumb: { width: space12 + 16, height: space12 + 16, borderRadius: tokens.radius.radiusSm, overflow: "hidden" },
  img: { width: "100%", height: "100%" },
  text: { flex: 1, gap: space1, justifyContent: "center" },
  meta: { flexDirection: "row", alignItems: "center", gap: space1 },
  links: { gap: space2, marginTop: space3 },
  link: { gap: space1, padding: space3 },
});
