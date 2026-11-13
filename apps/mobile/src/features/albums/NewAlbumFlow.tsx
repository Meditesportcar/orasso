// « Nouvel album » en trois étapes (lot R9e, maquette R9.5 `m-album`) : 1. l'événement (seulement ceux où le média est accrédité), 2. les
// photos (plaques : une décision pour le lot ; envoi une photo à la fois), 3. les détails et « Publier l'album ». Quitter en cours : le
// brouillon reste (« Reprendre l'album » à la prochaine ouverture pour le même événement). Un refus de l'API s'affiche, le flux reste.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { type AlbumPhotoView, type AlbumView, albumTitle, holdsLeave, albumLabels as L } from "@orasso/shared";
import { useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";
import { AlbumPhotoSheet, type PhotoTarget } from "./AlbumPhotoSheet";
import { AlbumStep1Event, eventChoices } from "./AlbumStep1Event";
import { AlbumStep2Photos } from "./AlbumStep2Photos";
import { AlbumStep3Details } from "./AlbumStep3Details";
import { useAlbumUploads } from "./useAlbumUploads";

const { space1, space2, space3 } = tokens.spacing;

/** « Étape N sur 3 » et trois segments (le courant en moutarde). */
function StepBar({ step }: { step: 1 | 2 | 3 }) {
  const { t } = useTheme();
  return (
    <View style={styles.steps} testID="album-steps">
      <View style={styles.bar}>
        {[1, 2, 3].map((n) => (
          <View key={n} style={[styles.seg, { backgroundColor: n <= step ? t.color.accent : t.color.line }]} />
        ))}
      </View>
      <Muted variant="caption" testID="album-step-label">
        {L.step(step)}
      </Muted>
    </View>
  );
}

export function NewAlbumFlow({ resumeId }: { resumeId?: string }) {
  const router = useRouter();
  const navigation = useNavigation();
  const profile = useApi(async () => (await api.myMediaProfile()).profile, [], { cacheKey: "media-profile" });
  const accreditations = useApi(() => api.myAccreditations("all"), [], { cacheKey: "media-accreditations" });
  const drafts = useApi(() => api.myAlbums(null, "draft"), [], { cacheKey: "my-album-drafts" });
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [chosen, setChosen] = useState<string | null>(null);
  const [album, setAlbum] = useState<AlbumView | null>(null);
  // Photos du brouillon d'avant cette séance (créé ou repris) : figées à l'arrivée, jamais relues à chaque retour (celles de la séance sont dans `uploads`).
  const [basePhotos, setBasePhotos] = useState<AlbumPhotoView[]>([]);
  const [editing, setEditing] = useState<{ kind: "item"; id: string } | { kind: "base"; id: string } | null>(null);
  const [title, setTitle] = useState("");
  const [allowSave, setAllowSave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploads = useAlbumUploads(album?.id ?? null);
  // Quitter pendant une opération (✕, retour du système) est bloqué : l'écran dit pourquoi, la sortie se refait après la fin.
  const [leaveNote, setLeaveNote] = useState(false);
  // La sortie voulue (la navigation d'une publication réussie) passe même tour tenu ; un formulaire mort ne retient jamais la sortie.
  const leaving = useRef(false);
  const holds = useRef((): boolean => false);
  holds.current = () => holdsLeave({ busy: uploads.isBusy(), leaving: leaving.current, alive: uploads.alive() });
  useEffect(
    () =>
      navigation.addListener("beforeRemove", (e) => {
        if (!holds.current()) return;
        e.preventDefault();
        setLeaveNote(true);
      }),
    [navigation],
  );
  useEffect(() => {
    if (!uploads.busy) setLeaveNote(false);
  }, [uploads.busy]);

  const choices = useMemo(() => eventChoices(accreditations.data ?? []), [accreditations.data]);
  const draftEvents = useMemo(() => new Set((drafts.data?.items ?? []).map((a) => a.event.id)), [drafts.data]);
  // Par défaut : le premier événement proposé (le plus récent où l'on est accrédité).
  const firstAvailable = choices.find((c) => c.state === "accredited")?.id ?? null;
  const eventId = chosen ?? firstAvailable;

  /** Arrivée sur un brouillon (créé ou repris) : titre, option et photos de départ viennent du serveur, **une seule fois**. */
  const arrive = useCallback((a: AlbumView) => {
    setAlbum(a);
    setBasePhotos(a.photos);
    setAllowSave(a.allowSave);
    // Le titre servi par défaut n'est pas un titre choisi : le champ reste vide (il montre le titre proposé).
    setTitle(a.title === albumTitle(null, a.event.title) ? "" : a.title);
  }, []);
  /** Relecture du brouillon (retour des détails, photos ajoutées) : jamais le titre ni l'option déjà modifiés, ni les photos de départ. */
  const refresh = useCallback((a: AlbumView) => setAlbum(a), []);

  // Reprise d'un brouillon par son adresse (`/album/nouveau?album=<id>`) : on retombe sur l'étape des photos.
  useEffect(() => {
    if (!resumeId) return;
    let live = true;
    // Le brouillon repris : l'écran affiche l'état du serveur (les photos de l'album), rien d'autre.
    api
      .album(resumeId)
      .then((a) => {
        // Une réponse qui arrive après un changement de compte n'est pas appliquée.
        if (!live || !uploads.alive()) return;
        if (a.status !== "draft" || !a.mine) {
          router.replace(`/album/${a.id}` as never);
          return;
        }
        arrive(a);
        setChosen(a.event.id);
        setStep(2);
      })
      .catch((e) => live && setError(errorMessage(e)));
    return () => {
      live = false;
    };
  }, [resumeId, router, arrive, uploads.alive]);

  async function createDraft() {
    // Une seule opération à la fois ; formulaire mort (autre compte) : aucune requête ne part.
    const token = eventId ? uploads.takeTurn() : null;
    if (!eventId || !token) return;
    setBusy(true);
    setError(null);
    try {
      const a = await api.createAlbum({ eventId, title: null });
      if (!uploads.alive()) return;
      arrive(a);
      setStep(2);
    } catch (e) {
      if (uploads.alive()) setError(errorMessage(e));
    } finally {
      setBusy(false);
      uploads.endTurn(token);
    }
  }

  async function toDetails() {
    const token = album ? uploads.takeTurn() : null;
    if (!album || !token) return;
    try {
      setError(null);
      // L'envoi s'achève sous le tour de « Continuer » (il ne le rend pas) : la lecture de l'album qui suit reste sous ce même tour.
      if (uploads.pending > 0 && !(await uploads.send(token))) return;
      const fresh = await api.album(album.id);
      if (!uploads.alive()) return;
      refresh(fresh);
      setStep(3);
    } catch (e) {
      if (uploads.alive()) setError(errorMessage(e));
    } finally {
      uploads.endTurn(token);
    }
  }

  async function publish() {
    const token = album ? uploads.takeTurn() : null;
    if (!album || !token) return;
    setBusy(true);
    setError(null);
    try {
      await api.patchAlbum(album.id, { title: title.trim(), allowSave });
      if (!uploads.alive()) return;
      const done = await api.publishAlbum(album.id);
      if (!uploads.alive()) return;
      void drafts.reload();
      leaving.current = true;
      router.replace(`/album/${done.id}` as never);
    } catch (e) {
      if (uploads.alive()) setError(errorMessage(e));
    } finally {
      setBusy(false);
      uploads.endTurn(token);
    }
  }

  const close = () => {
    if (holds.current()) {
      setLeaveNote(true);
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };
  const mediaName = profile.data?.name ?? album?.media.name ?? "";
  // Les plaques floutées de l'album, comptées par le serveur (brouillon repris compris), relues avant l'étape des détails.
  const blurred = album?.blurredCount ?? 0;
  const target: PhotoTarget = (() => {
    if (!editing) return null;
    if (editing.kind === "item") {
      const item = uploads.items.find((i) => i.clientId === editing.id);
      return item ? { kind: "item", item } : null;
    }
    const photo = basePhotos.find((p) => p.id === editing.id);
    return photo ? { kind: "base", photo } : null;
  })();
  /** Le seul chemin de retrait (`removeAlbumPhoto`) : photo de la séance, photo en vol, photo d'un brouillon repris. Elle ne part de l'écran qu'au 204. */
  async function removeTarget(): Promise<boolean> {
    if (!editing || !album) return false;
    if (editing.kind === "item") return uploads.remove(editing.id);
    const photo = basePhotos.find((p) => p.id === editing.id);
    if (!photo || !(await uploads.removeBase(photo))) return false;
    setBasePhotos((list) => list.filter((p) => p.id !== editing.id));
    return true;
  }

  return (
    <FlowScreen
      title={step === 1 ? L.newAlbum : step === 2 ? L.photosStep : L.detailsStep}
      facts={step === 1 ? mediaName : (album?.event.title ?? mediaName)}
      onClose={close}
      header={<StepBar step={step} />}
      overlays={
        <AlbumPhotoSheet
          target={target}
          onChange={uploads.setRects}
          onRemove={removeTarget}
          onClose={() => setEditing(null)}
          removing={uploads.removing}
          removeError={uploads.removeError}
          online={uploads.online}
          busy={uploads.busy || uploads.dead}
          error={uploads.error ?? error}
        />
      }
    >
      {uploads.dead ? (
        <Notice tone="error" testID="album-session-stale">
          {L.sessionChanged}
        </Notice>
      ) : null}
      {leaveNote ? (
        <Notice tone="error" testID="album-leave-blocked">
          {L.leaveBlocked}
        </Notice>
      ) : null}
      <View pointerEvents={uploads.dead ? "none" : "auto"} style={uploads.dead ? styles.dead : undefined}>
        {(accreditations.error && !accreditations.data) || (profile.error && !profile.data) ? (
          <Notice tone="error">{(accreditations.error ?? profile.error)?.message}</Notice>
        ) : null}
        {accreditations.loading && !accreditations.data && step === 1 ? <Text variant="body">Chargement…</Text> : null}
        {step === 1 && (accreditations.data || !accreditations.loading) ? (
          <AlbumStep1Event
            choices={choices}
            chosen={eventId}
            onChoose={setChosen}
            drafts={draftEvents}
            busy={busy || uploads.busy}
            error={error}
            onContinue={() => void createDraft()}
          />
        ) : null}
        {step === 2 && album ? (
          <>
            <AlbumStep2Photos
              uploads={uploads}
              basePhotos={basePhotos}
              onOpenItem={(id) => setEditing({ kind: "item", id })}
              onOpenBase={(id) => setEditing({ kind: "base", id })}
              onContinue={() => void toDetails()}
            />
            {error && !uploads.error ? <Notice tone="error">{error}</Notice> : null}
          </>
        ) : null}
        {step === 3 && album ? (
          <AlbumStep3Details
            album={album}
            mediaName={mediaName}
            title={title}
            onTitle={setTitle}
            allowSave={allowSave}
            onAllowSave={setAllowSave}
            blurred={blurred}
            busy={busy || uploads.busy || uploads.dead}
            error={error}
            onEditPhotos={() => setStep(2)}
            onPublish={() => void publish()}
          />
        ) : null}
      </View>
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  steps: { gap: space1, paddingHorizontal: space3, paddingVertical: space2 },
  bar: { flexDirection: "row", gap: space1 },
  seg: { flex: 1, height: 4, borderRadius: 2 },
  dead: { opacity: 0.4 },
});
