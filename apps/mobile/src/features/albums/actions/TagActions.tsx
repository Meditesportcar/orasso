// Les identifications de la visionneuse d'un album (lot R9f, maquette R9.6 `identH`). La visionneuse (`AlbumPhotoViewer`, partagée avec R9g)
// rend des boutons à libellé fixe : ceux d'ici ouvrent, sur la photo **affichée**, la feuille des identifications (`TagHost`, posée par
// l'écran dans l'emplacement `actions`) : la ligne « qui je suis », « Voitures identifiées · N » (une ligne par identification, croix quand
// je peux la retirer), le bouton principal « Identifier une voiture » (média, organisateur) ou « C'est ma voiture » (passionné), puis le
// plateau à choisir (`TagPicker`). La feuille s'ouvre dans sa propre fenêtre, **devant** la visionneuse : la photo reste ouverte dessous.
// Les droits sont ceux de l'API : l'écran n'affiche que ce qu'elle rend (`tags[].canRemove`, `removeAs`).
import { Button, Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type AlbumPhotoView,
  type AlbumTagView,
  type AlbumView,
  type AlbumViewerRole,
  albumTagLabels as L,
  taggedByText,
  whoLabelOf,
} from "@orasso/shared";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";

import { ConfirmSheet } from "@/features/orga/ConfirmSheet";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { AppSheet } from "@/ui/AppSheet";
import { Avatar } from "@/ui/Avatar";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SheetBoundary } from "@/ui/Overlay";
import { type PickResult, TagPicker } from "../TagPicker";
import type { AlbumViewerAction } from "./registry";
import { tagHost, useTagHostPhoto } from "./tagHost";

const { space2, space3 } = tokens.spacing;
const { radiusSm } = tokens.radius;

/** Les boutons de la visionneuse (une ligne dans `registry.ts`). */
export const tagViewerActions: AlbumViewerAction[] = [
  {
    id: "tag-identify",
    label: L.identifyCar,
    icon: "vehicle",
    roles: ["media", "organizer"],
    run: ({ photo }) => tagHost.open(photo.id),
  },
  {
    id: "tag-mine",
    label: L.itsMyCar,
    icon: "check",
    roles: ["tagged"],
    run: ({ photo }) => tagHost.open(photo.id),
  },
  // Tout autre membre voit qui est identifié (si le compte le permet) : la liste, sans bouton pour poser.
  {
    id: "tag-list",
    label: L.carsIdentified,
    icon: "vehicle",
    roles: ["member"],
    run: ({ photo }) => tagHost.open(photo.id),
  },
];

type Done = { name: string | null; self: boolean };

/**
 * La feuille des identifications de la photo ouverte. Posée dans l'emplacement `actions` de la visionneuse : elle ne rend rien tant
 * qu'aucun bouton ne l'a ouverte. `onChanged` relit l'album (les identifications viennent de l'API, jamais d'un état local).
 */
export function TagHost({
  album,
  role,
  onChanged,
}: {
  album: AlbumView;
  role: AlbumViewerRole;
  onChanged: () => Promise<unknown> | unknown;
}) {
  const photoId = useTagHostPhoto();
  const photo = photoId ? (album.photos.find((p) => p.id === photoId) ?? null) : null;
  if (!photo) return null;
  return <TagSheet key={photo.id} album={album} photo={photo} role={role} onChanged={onChanged} />;
}

function TagSheet({
  album,
  photo,
  role,
  onChanged,
}: {
  album: AlbumView;
  photo: AlbumPhotoView;
  role: AlbumViewerRole;
  onChanged: () => Promise<unknown> | unknown;
}) {
  const { t } = useTheme();
  const c = t.color;
  const [picking, setPicking] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<AlbumTagView | null>(null);
  const [busy, setBusy] = useState(false);
  const tags = photo.tags ?? [];
  const who = whoLabelOf(role);
  const canPose = role === "media" || role === "organizer" || role === "tagged";
  const close = () => tagHost.close();

  async function pose(pick: PickResult) {
    await api.tagPhoto(photo.id, pick.target);
    await onChanged();
    setPicking(false);
    // Une identification de soi-même ne prévient personne (T40) ; sinon, le propriétaire est prévenu (une notification pour l'album).
    setDone({ name: pick.pseudo, self: pick.self });
  }
  async function remove(tag: AlbumTagView) {
    setBusy(true);
    setError(null);
    try {
      if (tag.removeAs === "tagger") await api.untagPhoto(photo.id, tag.id);
      else await api.removeMyTag(tag.id);
      setConfirm(null);
      setDone(null);
      await onChanged();
    } catch (e) {
      setConfirm(null);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const gesture = confirm?.removeAs === "not_mine" ? "not_mine" : "withdraw";

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
      <SheetBoundary>
        <View style={styles.fill} testID="tag-host">
          <AppSheet
            visible={!picking && confirm === null}
            onClose={close}
            accessibilityLabel={L.carsIdentified}
            maxHeight={0.9}
          >
            {who ? (
              <View style={[styles.who, { backgroundColor: c.surface, borderColor: c.line }]} testID="tag-who">
                <Icon name="check" size={16} color={c.accentText} />
                <Text variant="caption" color={c.ink} style={styles.grow}>
                  {who}
                </Text>
              </View>
            ) : null}
            <Text variant="title" color={c.ink} accessibilityRole="header" testID="tag-list-title">
              {tags.length > 0 ? L.screens.carsIdentifiedCount(tags.length) : L.noCarIdentified}
            </Text>
            {tags.length === 0 ? (
              <Muted variant="body" testID="tag-empty">
                {role === "tagged" ? L.sayIfYours : canPose ? L.pickInLineup : L.nobodyYet}
              </Muted>
            ) : (
              <View style={styles.list} testID="tag-list">
                {tags.map((tag) => (
                  <TagLine
                    key={tag.id}
                    tag={tag}
                    by={taggedByText(tag, role, album.media.name)}
                    onRemove={() => setConfirm(tag)}
                  />
                ))}
              </View>
            )}
            {done ? (
              <View style={[styles.done, { backgroundColor: c.surface, borderColor: c.accent }]} testID="tag-done">
                <Text variant="bodyStrong" color={c.ink}>
                  {L.carIdentified}
                </Text>
                <Text variant="caption" color={c.ink}>
                  {L.canRemoveAnytime}
                </Text>
                {done.self ? null : (
                  <Text variant="caption" color={c.ink}>
                    {L.isNotified(done.name ?? L.screens.ownerName)}
                  </Text>
                )}
              </View>
            ) : null}
            {error ? (
              <Notice tone="error" testID="tag-error">
                {error}
              </Notice>
            ) : null}
            <Muted variant="caption" testID="tag-not-a-face">
              {L.notAFace}
            </Muted>
            {canPose ? (
              <Button
                variant="primary"
                icon={role === "tagged" ? "check" : "vehicle"}
                fullWidth
                onPress={() => {
                  setDone(null);
                  setError(null);
                  setPicking(true);
                }}
                testID="tag-open-picker"
              >
                {role === "tagged" ? L.itsMyCar : L.identifyCar}
              </Button>
            ) : null}
            <Button variant="plate" icon="close" fullWidth onPress={close} testID="tag-close">
              {L.screens.closePicker}
            </Button>
          </AppSheet>
          <TagPicker visible={picking} albumId={album.id} onClose={() => setPicking(false)} onPick={pose} />
          <ConfirmSheet
            visible={confirm !== null}
            title={gesture === "not_mine" ? L.notMyCar : L.withdrawMine}
            body={gesture === "not_mine" ? L.isNotifiedDeclined(album.media.name) : L.photoStaysWith(album.media.name)}
            confirmLabel={gesture === "not_mine" ? L.notMyCar : L.withdrawMine}
            confirmIcon="close"
            busy={busy}
            onConfirm={() => confirm && void remove(confirm)}
            onClose={() => setConfirm(null)}
          />
        </View>
      </SheetBoundary>
    </Modal>
  );
}

/** Une ligne « Voitures identifiées » : la voiture (ou la personne) et qui l'a identifiée ; la croix si je peux la retirer. */
function TagLine({ tag, by, onRemove }: { tag: AlbumTagView; by: string; onRemove: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  const pseudo = tag.kind === "vehicle" ? tag.user?.pseudo : null;
  return (
    <View
      style={[styles.line, { backgroundColor: c.surface, borderColor: tag.mine ? c.accent : c.line }]}
      testID="tag-line"
    >
      {tag.kind === "user" ? (
        <Avatar url={tag.user?.avatarUrl} pseudo={tag.user?.pseudo} size={40} />
      ) : (
        <View style={[styles.thumb, { backgroundColor: c.surfaceRaised }]}>
          <Icon name="vehicle" size={20} color={c.ink} />
        </View>
      )}
      <View style={styles.grow}>
        {/* Nom entier, jamais coupé. */}
        <Text variant="bodyStrong" color={c.ink} testID="tag-line-name">
          {tag.kind === "vehicle" ? [tag.vehicle?.label, pseudo].filter(Boolean).join(" · ") : (tag.user?.pseudo ?? "")}
        </Text>
        <Text variant="caption" color={c.inkMuted} testID="tag-line-by">
          {by}
        </Text>
      </View>
      {tag.canRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            tag.removeAs === "not_mine"
              ? L.notMyCar
              : tag.removeAs === "withdraw"
                ? L.withdrawMine
                : L.screens.removeTag
          }
          onPress={onRemove}
          hitSlop={8}
          style={styles.cross}
          testID="tag-line-remove"
        >
          <Icon name="close" size={18} color={c.ink} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  who: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    borderWidth: 1,
    borderRadius: tokens.radius.radiusPill,
    paddingHorizontal: space3,
    paddingVertical: space2,
    alignSelf: "flex-start",
  },
  list: { gap: space2 },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    borderWidth: 1,
    borderRadius: radiusSm,
    padding: space2,
  },
  thumb: { width: 40, height: 40, borderRadius: radiusSm, alignItems: "center", justifyContent: "center" },
  cross: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  done: { borderWidth: 1.5, borderRadius: radiusSm, padding: space3, gap: 2 },
});
