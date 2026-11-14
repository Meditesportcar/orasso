// La section « Photos » de la fiche d'un événement (lot R9g, maquette R9.8 `e-photos`, `photosH`) : les albums publiés des médias
// accrédités, l'album officiel en tête (T43 : dès qu'un album publié existe, même pendant l'événement ; sinon rien). Par album :
// la mosaïque, le titre (jamais tronqué), « <média> · N photos », le tag « Album officiel », « Voir l'album » ; pour l'organisateur
// de l'événement, le « … » qui ouvre la feuille « officiel ». Sans session la section se voit (T34), sans aucune action.
// Une panne de lecture n'est pas « aucun album » : le message et « Réessayer » ; la liste suit l'actualisation de la fiche (`refreshKey`) ; au-delà
// de la première page (50 albums), « Voir plus d'albums » (le total vient de l'API).
import { Icon, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type AlbumSummary, albumsOrder, eventPhotosLabels as L, showPhotosSection } from "@orasso/shared";
import { useRouter } from "expo-router";
import { type RefObject, useEffect, useRef, useState } from "react";
import { Pressable, type ScrollView, StyleSheet, View } from "react-native";

import { AlbumCover } from "@/features/albums/AlbumCover";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useApi } from "@/lib/useApi";
import { SmButton } from "@/ui/Kit";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SecHead } from "@/ui/SecHead";
import { AlbumSheet } from "./AlbumSheet";

const { space1, space2, space3, space6, space12 } = tokens.spacing;

/** Lien profond « Photos » : on attend que la page se stabilise (les blocs au-dessus se chargent), puis on défile une seule fois. */
const REVEAL_EVERY_MS = 150;
const REVEAL_TRIES = 20;

export function PhotosSection({
  slug,
  signedIn,
  ownStructure,
  refreshKey = 0,
  reveal = false,
  scrollRef,
  onRevealed,
}: {
  slug: string;
  signedIn: boolean;
  /** La casquette courante est l'organisateur de cet événement : le « … » de chaque album. */
  ownStructure: boolean;
  /** Change à chaque actualisation de la fiche (tirer pour actualiser, retour sur l'écran) : la liste est relue. */
  refreshKey?: number;
  /** Lien profond « Photos » : la page défile jusqu'à la section (mesurée dans le contenu du `ScrollView`, pas dans son bloc parent). */
  reveal?: boolean;
  scrollRef?: RefObject<ScrollView | null>;
  /** Le défilement a eu lieu : le lien profond ne défile plus. */
  onRevealed?: () => void;
}) {
  const { t } = useTheme();
  const router = useRouter();
  const list = useApi(() => api.eventAlbums(slug, signedIn), [slug, signedIn, refreshKey]);
  // Les pages suivantes (au-delà de 50 albums) : gardées à part, jetées quand la première page est relue.
  const [more, setMore] = useState<{ items: AlbumSummary[]; cursor: string | null } | null>(null);
  const [moreFailed, setMoreFailed] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [menu, setMenu] = useState<AlbumSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const block = useRef<View>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: la première page relue repart de zéro (`list.data` est la réponse entière).
  useEffect(() => {
    setMore(null);
    setMoreFailed(null);
  }, [list.data]);
  const seen = new Set<string>();
  const albums = albumsOrder([...(list.data?.items ?? []), ...(more?.items ?? [])]).filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
  const nextCursor = more ? more.cursor : (list.data?.nextCursor ?? null);
  const total = Math.max(list.data?.total ?? 0, albums.length);
  const visible = showPhotosSection(albums);
  useEffect(() => {
    if (!reveal || !visible || !scrollRef) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = Number.NaN;
    let stable = 0;
    let tries = 0;
    // Borné : si la mesure échoue sans cesse (page pas montée, nœud absent), on abandonne au bout de `REVEAL_TRIES` essais (la page reste où elle est).
    const again = () => {
      tries += 1;
      if (tries >= REVEAL_TRIES) {
        onRevealed?.();
        return;
      }
      timer = setTimeout(step, REVEAL_EVERY_MS);
    };
    const step = () => {
      if (cancelled) return;
      const node = block.current;
      const page = scrollRef.current;
      const inner = page?.getInnerViewNode?.();
      if (!node || !page || !inner) return again();
      node.measureLayout(
        inner,
        (_x, y) => {
          if (cancelled) return;
          stable = Math.abs(y - last) < 1 ? stable + 1 : 0;
          last = y;
          if (stable >= 2 || tries >= REVEAL_TRIES) {
            page.scrollTo({ y, animated: false });
            onRevealed?.();
            return;
          }
          again();
        },
        again,
      );
    };
    step();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [reveal, visible, scrollRef, onRevealed]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setMoreFailed(null);
    try {
      const page = await api.eventAlbums(slug, signedIn, nextCursor);
      setMore((m) => ({ items: [...(m?.items ?? []), ...page.items], cursor: page.nextCursor }));
    } catch (e) {
      setMoreFailed(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }

  // Une panne n'est pas une absence : sans albums déjà lus, le message et « Réessayer » (un 404 : fiche sans section, comme avant).
  if (list.error && !list.data && list.error.status !== 404) {
    return (
      <View style={styles.block} testID="event-photos">
        <SecHead title={L.title} testID="event-photos-title" />
        <View testID="event-photos-error">
          <LoadError message={L.loadFailed} onRetry={() => void list.reload()} />
        </View>
      </View>
    );
  }
  if (!visible) return null;
  return (
    <View ref={block} style={styles.block} testID="event-photos" collapsable={false}>
      <SecHead title={L.title} hint={L.albumsCount(total)} testID="event-photos-title" />
      {albums.map((a) => (
        <Plate key={a.id} style={styles.card}>
          <View style={styles.head}>
            <View style={styles.mosaic}>
              <AlbumCover photos={a.cover} height={space12 + space6} label={a.title} testID="event-photos-cover" />
            </View>
            <View style={styles.text}>
              <Text variant="bodyStrong" color={t.color.plateInk} testID="event-photos-album-title">
                {a.title}
              </Text>
              <Text variant="meta" color={t.color.plateMuted}>
                {L.mediaLine(a.media.name, a.photosCount)}
              </Text>
              {a.official ? (
                <View style={[styles.tag, { backgroundColor: t.color.accent, borderColor: t.color.accent }]}>
                  <Text variant="caption" color={t.color.accentInk} testID="event-photos-official">
                    {L.officialAlbum}
                  </Text>
                </View>
              ) : null}
            </View>
            {ownStructure ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={L.albumMenu}
                onPress={() => setMenu(a)}
                hitSlop={8}
                testID="event-photos-more"
              >
                <Icon name="more" size={22} color={t.color.plateInk} />
              </Pressable>
            ) : null}
          </View>
          <SmButton
            kind="s"
            icon="next"
            onPress={() => {
              // R9e : « voir les vues » ne disparaît pas : une vue à chaque ouverture de l'album depuis la fiche (seulement avec une session ; un échec est sans suite).
              if (signedIn) void api.viewMediaContent(a.id).catch(() => undefined);
              router.push(`/album/${a.id}` as never);
            }}
            testID="event-photos-open"
            accessibilityLabel={`${L.seeAlbum} : ${a.title}`}
          >
            {L.seeAlbum}
          </SmButton>
        </Plate>
      ))}
      {nextCursor ? (
        <SmButton
          kind="s"
          icon="down"
          disabled={loadingMore}
          onPress={() => void loadMore()}
          testID="event-photos-more-albums"
        >
          {L.moreAlbums}
        </SmButton>
      ) : null}
      {moreFailed ? (
        <View testID="event-photos-more-error">
          <LoadError message={L.loadFailed} onRetry={() => void loadMore()} />
        </View>
      ) : null}
      {notice ? <Notice testID="event-photos-notice">{notice}</Notice> : null}
      <Muted variant="caption">{L.footnote}</Muted>
      <AlbumSheet
        album={menu}
        onClose={() => setMenu(null)}
        onChanged={(message) => {
          setNotice(message);
          void list.reload();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2 },
  card: { gap: space3, padding: space3 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space3 },
  mosaic: { width: space12 * 2 },
  text: { flex: 1, gap: space1 },
  tag: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: tokens.radius.radiusPill,
    paddingHorizontal: space3,
    paddingVertical: space1,
  },
});
