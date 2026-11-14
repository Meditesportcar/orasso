// « Tes photos » (lot R9f, maquette R9.7 `apparaisH`, route `/album/<id>/mes-photos`) : les photos d'un album où je suis identifié, voiture ou
// pseudo. En-tête : le média, « N photos de ta <voiture> » (ou « N photos où tu es identifié ») et Une ligne par photo : la vignette, « Photo N », « Identifiée par <média> | toi », « En story » (la photo
// reprise telle quelle, avec le crédit du média qui ne se retire pas), « Enregistrer » (au choix du média : sinon inerte, avec sa raison), « … »
// (retirer mon identification, ce n'est pas ma voiture, signaler). **Aucun bouton principal** sur cet écran. Ces photos ne
// deviennent pas mes publications.
import { Button, Chip, ChipRow, Icon, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  albumLabels,
  createOperationGate,
  albumTagLabels as L,
  liveStoryAt,
  type MyPhoto,
  myPhotoTaggedBy,
  nextLiveStoryExpiry,
} from "@orasso/shared";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, View } from "react-native";

import { openReport } from "@/features/ReportSheet";
import { SmallButton } from "@/features/sorties/bits";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { Avatar } from "@/ui/Avatar";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";
import { Waiting } from "@/ui/Waiting";
import { AlbumPhoto } from "./AlbumPhoto";
import { PhotoSheet } from "./PhotoSheet";
import { savePhoto } from "./savePhoto";

const { space1, space2, space3 } = tokens.spacing;
const { radiusMd, radiusSm } = tokens.radius;

export function MyPhotosScreen({ id }: { id: string }) {
  const { t } = useTheme();
  const router = useRouter();
  const { me } = useSession();
  const view = useApi(() => api.myPhotos(id), [id]);
  const v = view.data;
  const [sheet, setSheet] = useState<MyPhoto | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [story, setStory] = useState<MyPhoto | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  // Les identifications que je viens de retirer disparaissent tout de suite, **rangées par `tagId`** : une photo peut porter deux
  // identifications de moi (ma voiture par le média, mon pseudo par moi), l'écran n'en montre qu'une ; retirer l'une laisse la photo.
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const alive = useRef(true);
  // « Enregistrer » : une opération à la fois, périmée à la perte de focus (une story ouverte par-dessus, un retour arrière) et à la fermeture.
  const saveGate = useRef(createOperationGate());
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      saveGate.current.invalidate();
    };
  }, []);
  // Présence à l'écran : une story ouverte par-dessus garde « Tes photos » monté sans focus.
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => {
        setFocused(false);
        saveGate.current.invalidate();
      };
    }, []),
  );
  // La sortie après un retrait : décidée par la relecture (404 = plus aucune identification à mon nom dans cet album), et seulement si
  // l'écran est monté et a le focus (sinon, à son retour). Une 404 de chargement ordinaire ne ferme rien.
  const exitWanted = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `close` est recréé à chaque rendu
  useEffect(() => {
    if (exitWanted.current && focused && view.error?.status === 404) {
      exitWanted.current = false;
      close();
    }
  }, [view.error, focused]);
  const photos = (v?.photos ?? []).filter((p) => !removed.has(p.tagId));
  // L'heure courante à chaque rendu (`tick` ne sert qu'à provoquer le rafraîchissement) : une réponse reçue après l'expiration d'une story
  // ne bloque pas « En story ». La relecture programmée passe par `useApi.reload` (garde de compte, ordre des lectures, erreur gardée).
  const nowMs = Date.now();
  const [tick, setTick] = useState(0);
  const reloadRef = useRef(view.reload);
  reloadRef.current = view.reload;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `tick` relance la programmation après chaque échéance
  useEffect(() => {
    // Le retour au premier plan rafraîchit l'heure, quoi qu'il arrive.
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") setTick((n) => n + 1);
    });
    const next = nextLiveStoryExpiry(v?.photos ?? [], Date.now());
    const id =
      next === null
        ? null
        : setTimeout(
            () => {
              setTick((n) => n + 1);
              void reloadRef.current();
            },
            Math.min(Math.max(next - Date.now(), 0) + 250, 2 ** 31 - 1),
          );
    return () => {
      if (id !== null) clearTimeout(id);
      sub.remove();
    };
  }, [v, tick]);
  // Un autre compte sur le même écran : les retraits de l'ancien ne masquent rien chez le nouveau.
  const accountId = me?.user.id ?? null;
  const previousAccountId = useRef(accountId);
  useEffect(() => {
    if (previousAccountId.current !== accountId) {
      previousAccountId.current = accountId;
      setRemoved(new Set());
      setReconciling(false);
      exitWanted.current = false;
    }
  }, [accountId]);
  const [reconciling, setReconciling] = useState(false);
  // Retraits non réconciliés : la relecture qui a suivi un retrait a échoué (panne, pas une 404). L'écran le dit, avec « Réessayer » ;
  // les retraits ne sont levés qu'après une lecture réussie.
  const reconcileError = removed.size > 0 && view.error && view.error.status !== 404 ? view.error : null;

  async function remove(photo: MyPhoto) {
    setSheetBusy(true);
    setSheetError(null);
    try {
      await api.removeMyTag(photo.tagId);
      setSheet(null);
      setNote(L.screens.removed);
      setRemoved((cur) => new Set([...cur, photo.tagId]));
    } catch (e) {
      setSheetError(errorMessage(e));
      setSheetBusy(false);
      return;
    }
    setSheetBusy(false);
    // La relecture passe par `useApi` (garde de compte, ordre des lectures, écran monté) : 404 = on quitte (effet ci-dessus) ; sinon la
    // photo reste (avec son autre identification) et la liste est celle du serveur.
    await reconcile();
  }
  async function reconcile() {
    exitWanted.current = true;
    setReconciling(true);
    const next = await view.reload();
    if (alive.current) setReconciling(false);
    if (next && alive.current) {
      exitWanted.current = false;
      setRemoved(new Set());
    }
  }
  async function save(photo: MyPhoto) {
    if (saving) return;
    setSaving(photo.id);
    setError(null);
    setNote(null);
    try {
      // Écran fermé ou compte changé pendant le téléchargement : le partage ne s'ouvre pas (`null`).
      const isCurrent = saveGate.current.start();
      const outcome = await savePhoto(photo.id, () => alive.current && isCurrent());
      if (outcome === null) return;
      setNote(outcome === "unavailable" ? "Le partage n'est pas disponible sur cet appareil." : L.screens.saved);
    } catch {
      setError(L.screens.saveFailed);
    } finally {
      setSaving(null);
    }
  }
  function report(photo: MyPhoto) {
    setSheet(null);
    openReport({ type: "album_photo", id: photo.id });
  }

  const count = photos.length;
  const headline = v ? (v.vehicle ? L.photosOfYourCar(count, v.vehicle.label) : L.photosWhereIdentified(count)) : "";
  return (
    <FlowScreen
      title={L.myPhotos}
      facts={v?.album.event.title}
      onClose={close}
      onRefresh={view.reload}
      overlays={
        <>
          <PhotoSheet
            photo={sheet}
            mediaName={v?.media.name ?? ""}
            busy={sheetBusy}
            error={sheetError}
            onClose={() => setSheet(null)}
            onRemove={(p) => void remove(p)}
            onReport={report}
          />
          <StorySheet
            photo={story}
            mediaName={v?.media.name ?? ""}
            albumId={id}
            authorKey={me ? `u:${me.user.id}` : null}
            onClose={() => setStory(null)}
            onDone={(text) => {
              setNote(text);
              void view.reload();
            }}
          />
        </>
      }
    >
      {view.loading && !v ? <Waiting blocks={[80, 90, 90]} label="Chargement…" /> : null}
      {/* 404 : plus aucune identification à mon nom dans cet album (la dernière vient d'être retirée) : pas une erreur de chargement. */}
      {view.error && !v && view.error.status === 404 ? <Muted variant="body">{L.screens.myPhotosEmpty}</Muted> : null}
      {reconcileError ? <LoadError message={reconcileError.message} onRetry={() => void reconcile()} /> : null}
      {view.error && !v && view.error.status !== 404 ? (
        <LoadError message={view.error.message} onRetry={() => void view.reload()} />
      ) : null}
      {v ? (
        <View style={styles.col} testID="my-photos">
          <View
            style={[styles.who, { backgroundColor: t.color.surface, borderColor: t.color.line }]}
            testID="my-photos-who"
          >
            <Avatar url={v.media.logoUrl} pseudo={v.media.name} size={44} />
            <View style={styles.grow}>
              <Text variant="bodyStrong" color={t.color.ink} testID="my-photos-media">
                {v.media.name}
              </Text>
              <Text variant="caption" color={t.color.inkMuted} testID="my-photos-headline">
                {headline}
              </Text>
            </View>
          </View>
          {note ? <Notice testID="my-photos-note">{note}</Notice> : null}
          {error ? (
            <Notice tone="error" testID="my-photos-error">
              {error}
            </Notice>
          ) : null}
          {count === 0 && reconciling && removed.size > 0 ? <Waiting blocks={[80]} label="Chargement…" /> : null}
          {count === 0 && !reconcileError && !(reconciling && removed.size > 0) ? (
            <Muted variant="body">{L.screens.myPhotosEmpty}</Muted>
          ) : null}
          {photos.map((p, i) => (
            <View
              key={p.id}
              style={[styles.row, { backgroundColor: t.color.surface, borderColor: t.color.line }]}
              testID="my-photo"
            >
              <View style={styles.thumb}>
                <AlbumPhoto photo={p} style={styles.img} cover />
              </View>
              <View style={styles.grow}>
                <Text variant="bodyStrong" color={t.color.ink}>
                  {L.photoN(i + 1)}
                </Text>
                <Text variant="caption" color={t.color.inkMuted} testID="my-photo-by">
                  {myPhotoTaggedBy(p.taggedBy, v.media.name)}
                </Text>
                <View style={styles.actions}>
                  {liveStoryAt(p.liveStory, nowMs) ? (
                    // Déjà en story : l'écran le dit, sans formulaire de public ni de légende (rien à régler).
                    <Text variant="caption" color={t.color.accentText} testID="my-photo-story-live">
                      {L.screens.storyAlready(L.screens.storyAudienceName(p.liveStory?.audience ?? "public"))}
                    </Text>
                  ) : (
                    <SmallButton
                      icon="camera"
                      disabled={!p.canStory}
                      onPress={() => setStory(p)}
                      testID="my-photo-story"
                    >
                      {L.inStory}
                    </SmallButton>
                  )}
                  <SmallButton
                    icon="export"
                    disabled={!p.canSave || saving !== null}
                    onPress={() => void save(p)}
                    testID="my-photo-save"
                  >
                    {saving === p.id ? L.screens.saving : L.save}
                  </SmallButton>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={albumLabels.more}
                    onPress={() => {
                      setSheetError(null);
                      setSheet(p);
                    }}
                    hitSlop={8}
                    style={[styles.more, { borderColor: t.color.line }]}
                    testID="my-photo-more"
                  >
                    <Icon name="more" size={20} color={t.color.ink} />
                  </Pressable>
                </View>
                {!p.canSave ? (
                  <Text variant="caption" color={t.color.inkMuted} testID="my-photo-save-off">
                    {L.saveNotAllowed(v.media.name)}
                  </Text>
                ) : null}
                {!p.canStory ? (
                  <Text variant="caption" color={t.color.inkMuted} testID="my-photo-story-off">
                    {L.errors.plateUnknown}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
          <Muted variant="caption" testID="my-photos-not-publications">
            {L.notMentions}
          </Muted>
        </View>
      ) : null}
    </FlowScreen>
  );
}

/**
 * « En story » : la photo est reprise telle quelle (aucun téléversement), avec le crédit du média en ligne visible et non modifiable ;
 * on choisit qui la voit et on peut ajouter une légende. Le serveur compose la story (plaque traitée, crédit) ; ici seulement le geste.
 */
function StorySheet({
  photo,
  mediaName,
  albumId,
  authorKey,
  onClose,
  onDone,
}: {
  photo: MyPhoto | null;
  mediaName: string;
  albumId: string;
  authorKey: string | null;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const { t } = useTheme();
  const router = useRouter();
  const [caption, setCaption] = useState("");
  const [audience, setAudience] = useState<"public" | "followers">("public");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Rejouée : la story de cette photo est déjà en ligne, l'API la rend telle quelle (ni public ni légende ne la modifient).
  const [done, setDone] = useState<{ replayed: boolean; audience: string } | null>(null);
  const reset = () => {
    setCaption("");
    setAudience("public");
    setError(null);
    setDone(null);
  };
  const shut = () => {
    reset();
    onClose();
  };
  async function publish() {
    if (!photo || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.photoToStory(photo.id, { audience, caption: caption.trim() || null });
      const shown = res.audience === "followers" ? L.screens.storyAudienceFollowers : L.screens.storyAudienceAll;
      setDone({ replayed: res.replayed, audience: shown });
      onDone(res.replayed ? L.screens.storyAlready(shown) : L.screens.storyShared(mediaName));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppSheet visible={photo !== null} onClose={shut} accessibilityLabel={L.screens.storyTitle} maxHeight={0.92}>
      {photo ? (
        <View style={styles.col} key={`${albumId}-${photo.id}`}>
          <Text variant="title" color={t.color.ink} accessibilityRole="header">
            {L.screens.storyTitle}
          </Text>
          <View style={[styles.storyPreview, { backgroundColor: t.color.surfaceRaised }]}>
            <AlbumPhoto photo={photo} style={styles.img} />
          </View>
          <View style={[styles.credit, { backgroundColor: t.color.night }]} testID="story-credit">
            <Text variant="caption" color={t.color.nightInk}>
              {albumLabels.creditLine(mediaName)}
            </Text>
          </View>
          <Muted variant="caption">{L.screens.storyCreditNote(mediaName)}</Muted>
          <Muted variant="caption">{L.screens.storyPlateNote}</Muted>
          {done ? (
            <>
              <Notice testID="story-done">
                {done.replayed
                  ? `${L.screens.storyAlready(done.audience)}. ${L.screens.storyAlreadyNote}`
                  : L.screens.storyDone}
              </Notice>
              {authorKey ? (
                <Button
                  variant="secondary"
                  icon="next"
                  fullWidth
                  onPress={() => {
                    shut();
                    router.push(`/story/${encodeURIComponent(authorKey)}` as never);
                  }}
                  testID="story-see"
                >
                  {L.screens.storySee}
                </Button>
              ) : null}
              <Button variant="plate" icon="close" fullWidth onPress={shut}>
                {L.screens.closePicker}
              </Button>
            </>
          ) : (
            <>
              <TextField
                label={L.screens.storyCaption}
                value={caption}
                onChangeText={setCaption}
                maxLength={120}
                testID="story-caption"
              />
              <Text variant="label" color={t.color.ink}>
                {L.screens.storyAudience}
              </Text>
              <ChipRow accessibilityRole="radiogroup">
                <Chip selected={audience === "public"} accessibilityRole="radio" onPress={() => setAudience("public")}>
                  {L.screens.storyAudienceAll}
                </Chip>
                <Chip
                  selected={audience === "followers"}
                  accessibilityRole="radio"
                  onPress={() => setAudience("followers")}
                >
                  {L.screens.storyAudienceFollowers}
                </Chip>
              </ChipRow>
              {error ? (
                <Notice tone="error" testID="story-error">
                  {error}
                </Notice>
              ) : null}
              <Button
                variant="primary"
                icon="camera"
                fullWidth
                loading={busy}
                onPress={() => void publish()}
                testID="story-publish"
              >
                {L.screens.storyPublish}
              </Button>
            </>
          )}
        </View>
      ) : null}
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  col: { gap: space3 },
  grow: { flex: 1 },
  who: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: space3,
    borderWidth: 1,
    borderRadius: radiusMd,
  },
  row: { flexDirection: "row", gap: space3, padding: space3, borderWidth: 1, borderRadius: radiusMd },
  thumb: { width: 88, height: 88, borderRadius: radiusSm, overflow: "hidden" },
  img: { width: "100%", height: "100%" },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space2, marginTop: space1 },
  more: {
    minWidth: 40,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: tokens.radius.radiusPill,
  },
  storyPreview: { width: "100%", height: 280, borderRadius: radiusMd, overflow: "hidden" },
  credit: {
    alignSelf: "flex-start",
    borderRadius: tokens.radius.radiusPill,
    paddingHorizontal: space3,
    paddingVertical: 4,
  },
});
