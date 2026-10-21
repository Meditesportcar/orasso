// Contenus, l'onglet du média (lot 55, prototype DA v2 `s-contenus`) : les vues apportées par Orasso et le nombre de
// contenus en grand, « Ajouter un contenu » (lien ou galerie de 30 photos au plus, sur un événement où l'on est
// accrédité), puis les contenus rangés par événement, avec « Mis en avant sur la page » quand l'organisation l'a décidé,
// les vues de chacun, modifier et supprimer. Publier, modifier et mettre en avant suivent les règles de l'API (lot 45).
import {
  Button,
  Chip,
  ChipRow,
  EmptyState,
  OLoader,
  Photo,
  Plate,
  Text,
  TextField,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import {
  mediaAppLabels as L,
  MEDIA_GALLERY_MAX_PHOTOS,
  type MediaContentView,
  type MediaPlatform,
  mediaPlatformLabels,
  mediaPlatforms,
} from "@orasso/shared";
import { useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, View } from "react-native";

import { ConfirmSheet } from "@/features/orga/ConfirmSheet";
import { api } from "@/lib/api";
import { nowMs } from "@/lib/clock";
import { formatDay } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { usePersona } from "@/lib/persona";
import { type PickedPhoto, pickPhotos } from "@/lib/photos";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { PhotoGrid, UploadProgress, type UploadState, waitUploadParked } from "@/ui/PhotoGrid";
import { TabScreen } from "@/ui/Screens";
import { contentCaption, groupByEvent, guessPlatform, normalizeUrl, totalViews } from "./model";

const { space1, space2, space3, space6, space12 } = tokens.spacing;

export function ContentsScreen() {
  const { t } = useTheme();
  const { goTab } = usePersona();
  const profile = useApi(async () => (await api.myMediaProfile()).profile, [], { cacheKey: "media-profile" });
  const contents = useApi(() => api.myMediaContents(), [], { cacheKey: "media-contents" });
  const accreditations = useApi(() => api.myAccreditations("all"), [], { cacheKey: "media-accreditations" });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<MediaContentView | null>(null);

  const list = contents.data ?? [];
  const groups = groupByEvent(list);
  // Les événements où l'on peut publier : ceux où l'accréditation est donnée (l'API refuse les autres).
  const accredited = (accreditations.data ?? []).filter((a) => a.status === "accepted");
  const reload = async () => void (await Promise.all([contents.reload(), accreditations.reload()]));

  return (
    <TabScreen
      title={L.contentsTitle}
      facts={profile.data?.name}
      onRefresh={reload}
      overlays={
        <>
          <AddContentSheet
            visible={adding}
            events={accredited.map((a) => ({ id: a.event.id, title: a.event.title, startsAt: a.event.startsAt }))}
            onClose={() => setAdding(false)}
            onDone={() => {
              setAdding(false);
              void reload();
            }}
          />
          <EditContentSheet
            item={editing}
            onClose={() => setEditing(null)}
            onDone={() => {
              setEditing(null);
              void reload();
            }}
          />
        </>
      }
    >
      <Plate style={styles.stats} testID="media-stats">
        <View style={styles.stat}>
          <Text variant="label" color={t.color.plateMuted}>
            {L.views}
          </Text>
          <Text variant="posterXl" color={t.color.plateInk}>
            {totalViews(list).toLocaleString("fr-FR")}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text variant="label" color={t.color.plateMuted}>
            {L.contents}
          </Text>
          <Text variant="posterXl" color={t.color.plateInk}>
            {list.length.toLocaleString("fr-FR")}
          </Text>
        </View>
      </Plate>

      <Button variant="primary" icon="add" fullWidth onPress={() => setAdding(true)} testID="media-add">
        {L.addContent}
      </Button>

      {contents.error && !contents.data ? <Notice tone="error">{contents.error.message}</Notice> : null}
      {contents.loading && !contents.data ? <OLoader label="Chargement…" /> : null}
      {contents.data && list.length === 0 ? (
        <EmptyState title={L.noContents} text={accredited.length > 0 ? L.noContentsText : L.needAccreditation} />
      ) : null}
      {contents.data && list.length === 0 && accredited.length === 0 ? (
        <Button variant="secondary" icon="explore" fullWidth onPress={() => goTab("explorer")}>
          {L.pressSeeExplorer}
        </Button>
      ) : null}

      {groups.map((g) => (
        <View key={g.event.id} style={styles.group} testID="media-group">
          <View style={styles.groupHead}>
            <Text variant="title" color={t.color.ink} style={styles.fill}>
              {g.event.title}
            </Text>
            <Muted variant="caption">{g.featured.length > 0 ? L.featured : formatDay(g.event.startsAt)}</Muted>
          </View>
          {g.contents.map((c) => (
            <ContentRow key={c.id} c={c} onPress={() => setEditing(c)} />
          ))}
        </View>
      ))}
    </TabScreen>
  );
}

function ContentRow({ c, onPress }: { c: MediaContentView; onPress: () => void }) {
  const { t } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${L.kindOf(c)}, ${c.title}, ${contentCaption(c)}`}
      onPress={onPress}
      testID="media-content"
    >
      <Plate style={styles.row}>
        <View style={styles.rowTop}>
          <View style={styles.rowText}>
            <Text variant="bodyStrong" color={t.color.plateInk}>
              {`${L.kindOf(c)} · ${c.title}`}
            </Text>
            <Text variant="meta" color={t.color.plateMuted}>
              {contentCaption(c)}
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
  );
}

// --- Ajouter ------------------------------------------------------------------------------------------------------------------

type EventChoice = { id: string; title: string; startsAt: string };

function AddContentSheet({
  visible,
  events,
  onClose,
  onDone,
}: {
  visible: boolean;
  events: EventChoice[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTheme();
  const [eventId, setEventId] = useState<string | null>(null);
  const [kind, setKind] = useState<"link" | "gallery">("link");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [platform, setPlatform] = useState<MediaPlatform>("website");
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Par défaut : le dernier événement commencé (on publie après coup), sinon le premier.
  const byRecent = [...events].sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const latest = byRecent.find((e) => new Date(e.startsAt).getTime() <= nowMs()) ?? byRecent[0];
  const chosen = eventId ?? latest?.id ?? null;
  const ready =
    chosen !== null && title.trim().length >= 2 && (kind === "link" ? Boolean(url.trim()) : photos.length > 0);

  function reset() {
    setEventId(null);
    setKind("link");
    setTitle("");
    setUrl("");
    setPlatform("website");
    setPhotos([]);
    setError(null);
    setUpload(null);
  }

  async function pick() {
    const more = await pickPhotos(MEDIA_GALLERY_MAX_PHOTOS - photos.length);
    setPhotos((cur) => [...cur, ...more].slice(0, MEDIA_GALLERY_MAX_PHOTOS));
  }

  async function publish() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      const keys: string[] = [];
      if (kind === "gallery") {
        for (const [i, photo] of photos.entries()) {
          setUpload({ current: i + 1, total: photos.length });
          const form = new FormData();
          form.append("purpose", "media_content");
          if (Platform.OS === "web") {
            const blob = await (await fetch(photo.uri)).blob();
            form.append("file", new File([blob], `photo-${i + 1}.jpg`, { type: "image/jpeg" }));
          } else {
            form.append("file", { uri: photo.uri, name: `photo-${i + 1}.jpg`, type: "image/jpeg" } as unknown as Blob);
          }
          keys.push((await api.upload(form)).key);
        }
        setUpload({ current: photos.length, total: photos.length, done: true });
        await waitUploadParked();
      }
      await api.createMediaContent({
        eventId: chosen,
        kind,
        title: title.trim(),
        url: kind === "link" ? normalizeUrl(url) : null,
        platform: kind === "link" ? platform : "other",
        photoKeys: keys,
      });
      reset();
      onDone();
    } catch (e) {
      setError(errorMessage(e));
      setUpload(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={L.addTitle} maxHeight={0.9}>
      <Text variant="title" color={t.color.ink}>
        {L.addTitle}
      </Text>
      {events.length === 0 ? (
        <Notice testID="media-add-blocked">{L.needAccreditation}</Notice>
      ) : (
        <>
          <Muted variant="label">{L.addEvent}</Muted>
          <ChipRow>
            {byRecent.map((e) => (
              <Chip key={e.id} selected={chosen === e.id} onPress={() => setEventId(e.id)}>
                {e.title}
              </Chip>
            ))}
          </ChipRow>
          <Muted variant="label">{L.addKind}</Muted>
          <ChipRow accessibilityRole="radiogroup" accessibilityLabel={L.addKind}>
            <Chip accessibilityRole="radio" selected={kind === "link"} onPress={() => setKind("link")}>
              Lien
            </Chip>
            <Chip accessibilityRole="radio" selected={kind === "gallery"} onPress={() => setKind("gallery")}>
              Galerie
            </Chip>
          </ChipRow>
          <TextField
            label={L.addTitleField}
            help={L.addTitleHelp}
            value={title}
            onChangeText={setTitle}
            maxLength={80}
          />
          {kind === "link" ? (
            <>
              <TextField
                label={L.addUrl}
                help={L.addUrlHelp}
                value={url}
                onChangeText={(v) => {
                  setUrl(v);
                  setPlatform(guessPlatform(v));
                }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                testID="media-url"
              />
              <Muted variant="label">{L.addPlatform}</Muted>
              <ChipRow>
                {mediaPlatforms.map((p) => (
                  <Chip key={p} selected={platform === p} onPress={() => setPlatform(p)}>
                    {mediaPlatformLabels[p]}
                  </Chip>
                ))}
              </ChipRow>
            </>
          ) : (
            <>
              <Muted variant="label">
                {`${L.addPhotos} · ${L.addPhotosCount(photos.length, MEDIA_GALLERY_MAX_PHOTOS)}`}
              </Muted>
              {photos.length > 0 ? (
                <PhotoGrid
                  photos={photos.map((p, i) => ({ key: `${p.uri}-${i}`, source: { uri: p.uri } }))}
                  tileStyle={{ width: space12 * 2, height: space12 + space6, borderRadius: tokens.radius.radiusSm }}
                  disabled={busy}
                  onRemove={(i) => setPhotos((cur) => cur.filter((_, j) => j !== i))}
                />
              ) : null}
              <Button
                variant="plate"
                icon="gallery"
                disabled={busy || photos.length >= MEDIA_GALLERY_MAX_PHOTOS}
                onPress={() => void pick()}
                testID="media-pick"
              >
                {L.addPhotosPick}
              </Button>
            </>
          )}
          {upload ? <UploadProgress {...upload} /> : null}
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button
            variant="primary"
            icon="check"
            loading={busy}
            disabled={!ready || busy}
            fullWidth
            onPress={() => void publish()}
            testID="media-publish"
          >
            {L.addPublish}
          </Button>
        </>
      )}
    </AppSheet>
  );
}

// --- Modifier -----------------------------------------------------------------------------------------------------------------

function EditContentSheet({
  item,
  onClose,
  onDone,
}: {
  item: MediaContentView | null;
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <AppSheet visible={item !== null} onClose={onClose} accessibilityLabel={L.editTitle} maxHeight={0.9}>
      {item ? <EditBody key={item.id} item={item} onClose={onClose} onDone={onDone} /> : null}
    </AppSheet>
  );
}

function EditBody({ item, onClose, onDone }: { item: MediaContentView; onClose: () => void; onDone: () => void }) {
  const { t } = useTheme();
  const [title, setTitle] = useState(item.title);
  const [url, setUrl] = useState(item.url ?? "");
  const [platform, setPlatform] = useState<MediaPlatform>(item.platform);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.updateMediaContent(item.id, {
        title: title.trim(),
        ...(item.kind === "link" ? { url: normalizeUrl(url), platform } : {}),
      });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteMediaContent(item.id);
      setConfirm(false);
      onDone();
    } catch (e) {
      setConfirm(false);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Text variant="title" color={t.color.ink}>
        {L.editTitle}
      </Text>
      <Muted variant="body">{`${item.event.title} · ${L.kindOf(item)}`}</Muted>
      <TextField label={L.addTitleField} value={title} onChangeText={setTitle} maxLength={80} />
      {item.kind === "link" ? (
        <>
          <TextField
            label={L.addUrl}
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <ChipRow>
            {mediaPlatforms.map((p) => (
              <Chip key={p} selected={platform === p} onPress={() => setPlatform(p)}>
                {mediaPlatformLabels[p]}
              </Chip>
            ))}
          </ChipRow>
          {item.url ? (
            <Button
              variant="plate"
              icon="next"
              onPress={() => void Linking.openURL(item.url ?? "").catch(() => undefined)}
            >
              {L.openContent}
            </Button>
          ) : null}
        </>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button
        variant="primary"
        icon="check"
        loading={busy}
        disabled={busy || title.trim().length < 2}
        fullWidth
        onPress={() => void save()}
        testID="media-edit-save"
      >
        {L.editSave}
      </Button>
      <Button
        variant="plate"
        tone="dashed"
        icon="close"
        disabled={busy}
        fullWidth
        onPress={() => setConfirm(true)}
        testID="media-delete"
      >
        {L.deleteContent}
      </Button>
      <Button variant="plate" icon="back" fullWidth onPress={onClose}>
        Fermer
      </Button>
      <ConfirmSheet
        modal
        visible={confirm}
        title={L.deleteConfirm}
        body={L.deleteText}
        confirmLabel={L.deleteYes}
        confirmIcon="close"
        cancelLabel={L.deleteNo}
        danger
        busy={busy}
        onConfirm={() => void remove()}
        onClose={() => setConfirm(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  stats: { flexDirection: "row", gap: space3, padding: space3 },
  stat: { flex: 1, gap: space1 },
  group: { gap: space2, marginTop: space2 },
  groupHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space2 },
  row: { gap: space2, padding: space3 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: space2 },
  rowText: { flex: 1, gap: space1 },
  thumbs: { flexDirection: "row", gap: space2 },
  thumb: { width: space12 + space6, height: space12, borderRadius: tokens.radius.radiusSm },
});
