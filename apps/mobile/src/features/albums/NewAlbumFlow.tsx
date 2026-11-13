// « Nouvel album » en trois étapes (lot R9e, maquette R9.5 `m-album`) : 1. l'événement (seulement ceux où le média est accrédité), 2. les
// photos (plaques : une décision pour le lot ; envoi une photo à la fois), 3. les détails et « Publier l'album ». Quitter en cours : le
// brouillon reste (« Reprendre l'album » à la prochaine ouverture pour le même événement). Un refus de l'API s'affiche, le flux reste.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { type AlbumPhotoView, type AlbumView, albumTitle, albumLabels as L } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
    api
      .album(resumeId)
      .then((a) => {
        if (!live) return;
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
  }, [resumeId, router, arrive]);

  async function createDraft() {
    if (!eventId) return;
    setBusy(true);
    setError(null);
    try {
      const a = await api.createAlbum({ eventId, title: null });
      arrive(a);
      setStep(2);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function toDetails() {
    if (!album) return;
    setError(null);
    if (uploads.pending > 0 && !(await uploads.send())) return;
    try {
      refresh(await api.album(album.id));
      setStep(3);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function publish() {
    if (!album) return;
    setBusy(true);
    setError(null);
    try {
      await api.patchAlbum(album.id, { title: title.trim(), allowSave });
      const done = await api.publishAlbum(album.id);
      void drafts.reload();
      router.replace(`/album/${done.id}` as never);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));
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
  async function removeTarget(): Promise<boolean> {
    if (!editing || !album) return false;
    if (editing.kind === "item") return uploads.remove(editing.id);
    try {
      await api.deleteAlbumPhoto(album.id, editing.id);
      setBasePhotos((list) => list.filter((p) => p.id !== editing.id));
      refresh(await api.album(album.id));
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
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
          error={uploads.error ?? error}
        />
      }
    >
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
          busy={busy}
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
          busy={busy}
          error={error}
          onEditPhotos={() => setStep(2)}
          onPublish={() => void publish()}
        />
      ) : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  steps: { gap: space1, paddingHorizontal: space3, paddingVertical: space2 },
  bar: { flexDirection: "row", gap: space1 },
  seg: { flex: 1, height: 4, borderRadius: 2 },
});
