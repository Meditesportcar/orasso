// L'album ouvert (lot R9e, maquette R9.5 pg) : en-tête de page (logo, nom du média, « Plus »), couverture en mosaïque, titre, tags
// (« N photos », « Photos : <média> », « Album officiel »), « présent au <événement> » (ouvre la fiche), **un emplacement vide pour R9f**
// (« Identifier les voitures »), la grille de photos (par paquets : une photo se lit toute seule, avec le jeton), la visionneuse. « Plus » :
// Partager, Signaler ; pour le média : Modifier le titre, Autoriser l'enregistrement, Supprimer. Aucun nom de véhicule ni pseudo en R9e.
import { Button, Icon, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { type AlbumPhotoView, type AlbumView, albumLabels as L } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, Share, StyleSheet, View } from "react-native";

import { siteUrl } from "@/api";
import { ConfirmSheet } from "@/features/orga/ConfirmSheet";
import { openReport } from "@/features/ReportSheet";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { Overlay } from "@/ui/Overlay";
import { FlowScreen } from "@/ui/Screens";
import { Waiting } from "@/ui/Waiting";
import { AlbumCover } from "./AlbumCover";
import { AlbumPhoto } from "./AlbumPhoto";
import { AlbumPhotoViewer } from "./AlbumPhotoViewer";
import type { AlbumViewerRole } from "./actions/registry";

const { space1, space2, space3 } = tokens.spacing;
/** Vignettes montrées d'abord, puis « Voir plus » : chaque photo est lue en entier (1 600 px), 200 d'un coup pèseraient trop. */
const PAGE = 24;

export function AlbumScreen({ id }: { id: string }) {
  const { t } = useTheme();
  const router = useRouter();
  const album = useApi(() => api.album(id), [id], { cacheKey: `album-${id}` });
  const [shown, setShown] = useState(PAGE);
  const [viewer, setViewer] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<AlbumPhotoView | null>(null);
  // Les vues comptent à l'ouverture d'une photo (comme avant par la galerie) : une fois par ouverture de l'écran, reprise après un échec.
  const counted = useRef(false);
  const [titling, setTitling] = useState<string | null>(null);
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const a: AlbumView | null = album.data;

  async function patch(body: { title?: string | null; allowSave?: boolean }) {
    setError(null);
    try {
      album.setData(await api.patchAlbum(id, body));
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  function openViewer(i: number) {
    setViewer(i);
    if (counted.current || !a) return;
    counted.current = true;
    api.viewMediaContent(a.id).catch(() => {
      counted.current = false;
    });
  }
  /** Signaler la photo affichée : la visionneuse (un `Modal` natif) se ferme avant que la feuille de signalement ne s'ouvre. */
  function reportPhoto(photo: AlbumPhotoView) {
    setViewer(null);
    setTimeout(() => openReport({ type: "album_photo", id: photo.id }), 350);
  }
  async function removePhoto() {
    const photo = removing;
    setRemoving(null);
    if (!photo) return;
    try {
      await api.deleteAlbumPhoto(id, photo.id);
      setViewer(null);
      album.setData(await api.album(id));
    } catch (e) {
      setViewer(null);
      setError(errorMessage(e));
    }
  }
  async function share() {
    setMenu(false);
    if (!a) return;
    const url = siteUrl(`/albums/${a.id}`);
    try {
      await Share.share({ message: `${a.title} : ${url}`, url, title: a.title });
    } catch {
      // Navigateur de recette : pas de feuille de partage.
    }
  }
  async function remove() {
    try {
      await api.deleteAlbum(id);
      setConfirm(false);
      router.replace("/");
    } catch (e) {
      setConfirm(false);
      setError(errorMessage(e));
    }
  }

  const role: AlbumViewerRole = a?.mine ? "media" : "member";
  return (
    <FlowScreen
      title={a?.media.name ?? L.albums}
      onClose={close}
      onRefresh={album.reload}
      actions={
        a ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={L.more}
            onPress={() => setMenu(true)}
            hitSlop={8}
            testID="album-more"
          >
            <Icon name="more" size={22} color={t.color.ink} />
          </Pressable>
        ) : undefined
      }
      overlays={
        <Overlay>
          <AppSheet visible={menu} onClose={() => setMenu(false)} accessibilityLabel={L.more}>
            <Button variant="secondary" icon="share" fullWidth onPress={() => void share()} testID="album-share">
              {L.share}
            </Button>
            {a?.mine ? (
              <>
                <Button
                  variant="secondary"
                  icon="edit"
                  fullWidth
                  onPress={() => {
                    setMenu(false);
                    setTitling(a.title);
                  }}
                  testID="album-edit-title"
                >
                  {L.editTitle}
                </Button>
                <Button
                  variant="secondary"
                  icon="check"
                  fullWidth
                  onPress={() => {
                    setMenu(false);
                    void patch({ allowSave: !a.allowSave });
                  }}
                  testID="album-toggle-save"
                >
                  {a.allowSave ? L.forbidSaveAction : L.allowSaveAction}
                </Button>
                <Button
                  variant="secondary"
                  icon="trash"
                  fullWidth
                  onPress={() => {
                    setMenu(false);
                    setConfirm(true);
                  }}
                  testID="album-delete"
                >
                  {L.deleteAlbum}
                </Button>
              </>
            ) : null}
          </AppSheet>
          <ConfirmSheet
            visible={confirm}
            title={L.deleteAlbum}
            body={L.deleteConfirm}
            danger
            confirmLabel={L.deleteAlbum}
            onConfirm={() => void remove()}
            onClose={() => setConfirm(false)}
          />
          <AppSheet visible={titling !== null} onClose={() => setTitling(null)} accessibilityLabel={L.editTitle}>
            <TextField
              label={L.titleField}
              help={L.titleHelp}
              value={titling ?? ""}
              onChangeText={setTitling}
              maxLength={80}
              testID="album-title-input"
            />
            <Button
              variant="primary"
              icon="check"
              fullWidth
              onPress={() => {
                const next = (titling ?? "").trim();
                setTitling(null);
                void patch({ title: next });
              }}
              testID="album-title-save"
            >
              {L.modify}
            </Button>
          </AppSheet>
          <ConfirmSheet
            visible={removing !== null}
            title={L.photoRemove}
            body={L.photoRemoveConfirm}
            danger
            confirmLabel={L.photoRemove}
            onConfirm={() => void removePhoto()}
            onClose={() => setRemoving(null)}
          />
          {a ? (
            <AlbumPhotoViewer
              album={a}
              index={viewer}
              role={role}
              onClose={() => setViewer(null)}
              onReport={reportPhoto}
              onRemove={(photo) => {
                // Comme « Signaler » : un Modal natif resterait devant la confirmation.
                setViewer(null);
                setTimeout(() => setRemoving(photo), 350);
              }}
            />
          ) : null}
        </Overlay>
      }
    >
      {album.loading && !a ? <Waiting blocks={[180, 60]} label="Chargement…" /> : null}
      {album.error && !a ? <LoadError message={album.error.message} onRetry={() => void album.reload()} /> : null}
      {a ? (
        <View style={styles.block} testID="album-open">
          <AlbumCover photos={a.cover} height={190} label={L.coverAlt(a.title)} />
          <View style={styles.titleBlock}>
            <Text variant="title" color={t.color.ink} accessibilityRole="header" testID="album-open-title">
              {a.title}
            </Text>
            <View style={styles.tags}>
              <Tag testID="album-tag-count">{L.photosCount(a.photosCount)}</Tag>
              <Tag testID="album-tag-credit">{L.creditLine(a.media.name)}</Tag>
              {a.official ? (
                <Tag accent testID="album-tag-official">
                  {L.officialAlbum}
                </Tag>
              ) : null}
              {a.status === "draft" ? <Tag testID="album-tag-draft">{L.draft}</Tag> : null}
            </View>
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push(`/e/${a.event.slug}`)}
              style={styles.at}
              testID="album-event-link"
            >
              <Text variant="caption" color={t.color.accentText}>
                {L.presentAt(a.event.title)}
              </Text>
              <Icon name="next" size={14} color={t.color.accentText} />
            </Pressable>
          </View>
          {/* Emplacement de R9f : « Identifier les voitures » (pas de contenu en R9e). */}
          <View testID="album-identify-slot" />
          {a.mine && a.status === "draft" ? (
            <Button
              variant="primary"
              icon="next"
              fullWidth
              onPress={() => router.push(`/album/nouveau?album=${a.id}` as never)}
              testID="album-resume"
            >
              {L.resume}
            </Button>
          ) : null}
          <View style={styles.grid} testID="album-photos">
            {a.photos.slice(0, shown).map((p, i) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityLabel={L.openPhoto(i + 1, a.photos.length)}
                onPress={() => openViewer(i)}
                style={[styles.tile, { backgroundColor: t.color.surface }]}
                testID="album-photo"
              >
                <AlbumPhoto photo={p} style={styles.img} cover />
              </Pressable>
            ))}
          </View>
          {a.photos.length > shown ? (
            <Button
              variant="secondary"
              icon="down"
              fullWidth
              onPress={() => setShown((n) => n + PAGE)}
              testID="album-more-photos"
            >
              {L.loadMore}
            </Button>
          ) : null}
          {error ? <Notice tone="error">{error}</Notice> : null}
          {a.photos.length === 0 ? <Muted variant="body">{L.empty}</Muted> : null}
        </View>
      ) : null}
    </FlowScreen>
  );
}

function Tag({ children, accent = false, testID }: { children: string; accent?: boolean; testID?: string }) {
  const { t } = useTheme();
  return (
    <View
      style={[
        styles.tag,
        {
          backgroundColor: accent ? t.color.accent : t.color.surface,
          borderColor: accent ? t.color.accent : t.color.line,
        },
      ]}
      testID={testID}
    >
      <Text variant="caption" color={accent ? t.color.accentInk : t.color.ink}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space3 },
  titleBlock: { gap: space2 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  tag: { borderWidth: 1, borderRadius: tokens.radius.radiusPill, paddingHorizontal: space3, paddingVertical: space1 },
  at: { flexDirection: "row", alignItems: "center", gap: space1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space1 },
  tile: { width: "32.5%", aspectRatio: 1, borderRadius: tokens.radius.radiusSm, overflow: "hidden" },
  img: { width: "100%", height: "100%" },
});
