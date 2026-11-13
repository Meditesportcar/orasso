// L'onglet « Contenus » de la page d'un média (lot R9b, T22, avant les albums de R9e qui le renommeront « Albums ») : pour le
// propriétaire, l'écran d'aujourd'hui tel quel (les deux tuiles de vues, « Ajouter un contenu », les contenus par événement ;
// `ContentsScreen embedded`) ; pour un visiteur, les liens et galeries **publics** du média (`GET /media/:id/contents`), un lien
// s'ouvre dans le navigateur et compte une vue, une galerie s'ouvre en plein écran (comme sur la fiche d'un événement).
// R9e reprendra ce fichier (→ `PageAlbums`) : les liens iront dans les albums (T8).
import { Chip, Photo, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { mediaAppLabels as L, type MediaContentView, pagesLabels as PL } from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { Gallery } from "@/features/event/MediaContents";
import { ContentsScreen } from "@/features/media/ContentsScreen";
import { contentCaption } from "@/features/media/model";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { SmButton } from "@/ui/Kit";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Overlay } from "@/ui/Overlay";
import { Waiting } from "@/ui/Waiting";

const { space1, space2, space3, space6, space12 } = tokens.spacing;

export function PageContents({
  mediaId,
  owner,
  reloadToken = 0,
}: {
  mediaId: string;
  owner: boolean;
  /** Change quand la Page est tirée pour recharger. */
  reloadToken?: number;
}) {
  return owner ? (
    <ContentsScreen embedded reloadToken={reloadToken} />
  ) : (
    <PublicContents mediaId={mediaId} reloadToken={reloadToken} />
  );
}

type State = {
  items: MediaContentView[];
  next: string | null;
  loaded: boolean;
  loading: boolean;
  error: string | null;
};

function PublicContents({ mediaId, reloadToken }: { mediaId: string; reloadToken: number }) {
  const { t } = useTheme();
  const [state, setState] = useState<State>({ items: [], next: null, loaded: false, loading: true, error: null });
  const [open, setOpen] = useState<MediaContentView | null>(null);
  const seq = useRef(0);
  const cursor = useRef<string | null>(null);

  const read = useCallback(
    async (first: boolean) => {
      const mine = first ? ++seq.current : seq.current;
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const page = await api.mediaPublicContents(mediaId, first ? null : cursor.current);
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
    [mediaId],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: le jeton relit la liste, sans la démonter
  useEffect(() => {
    cursor.current = null;
    void read(true);
    return () => {
      seq.current++;
    };
  }, [read, reloadToken]);

  const show = (c: MediaContentView) => {
    void api.viewMediaContent(c.id).catch(() => undefined);
    if (c.kind === "gallery") setOpen(c);
    else if (c.url) void Linking.openURL(c.url).catch(() => undefined);
  };

  if (!state.loaded && state.loading) return <Waiting blocks={[96, 96]} label="Chargement…" />;
  if (!state.loaded && state.error) return <LoadError message={state.error} onRetry={() => void read(true)} />;
  return (
    <View style={styles.block} testID="page-contents">
      {state.items.length === 0 ? <Muted variant="body">{PL.contentsEmpty}</Muted> : null}
      {state.items.map((c) => (
        <Pressable
          key={c.id}
          accessibilityRole="button"
          accessibilityLabel={`${L.kindOf(c)}, ${c.title}, ${L.by(c.media.name)}`}
          onPress={() => show(c)}
          testID="page-content"
        >
          <Plate style={styles.card}>
            <View style={styles.top}>
              <View style={styles.text}>
                <Text variant="bodyStrong" color={t.color.plateInk}>
                  {`${L.kindOf(c)} · ${c.title}`}
                </Text>
                <Text variant="meta" color={t.color.plateMuted}>
                  {`${c.event.title} · ${contentCaption(c)}`}
                </Text>
              </View>
              {c.featured ? (
                <Chip surface="plate" selected>
                  {L.eventFeatured}
                </Chip>
              ) : null}
            </View>
            {c.kind === "gallery" && c.photos.length > 0 ? (
              <View style={styles.thumbs}>
                {c.photos.slice(0, 3).map((p) => (
                  <Photo key={p.key} source={mediaSource(p.url)} style={styles.thumb} />
                ))}
              </View>
            ) : null}
          </Plate>
        </Pressable>
      ))}
      {state.error ? <LoadError message={state.error} onRetry={() => void read(state.items.length === 0)} /> : null}
      {state.next && !state.error ? (
        <SmButton
          kind="s"
          wide
          icon="down"
          disabled={state.loading}
          onPress={() => void read(false)}
          testID="page-contents-more"
        >
          Voir plus
        </SmButton>
      ) : null}
      <Overlay>
        <Gallery item={open} onClose={() => setOpen(null)} />
      </Overlay>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2 },
  card: { gap: space2, padding: space3 },
  top: { flexDirection: "row", alignItems: "center", gap: space2 },
  text: { flex: 1, gap: space1 },
  thumbs: { flexDirection: "row", gap: space2 },
  thumb: { width: space12 + space6, height: space12, borderRadius: tokens.radius.radiusSm },
});
