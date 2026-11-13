// « Nouvel album » en trois étapes (lot R9e, maquette R9.5 `m-album`) : 1. l'événement (seulement ceux où le média est accrédité), 2. les
// photos (plaques : une décision pour le lot ; envoi une photo à la fois), 3. les détails et « Publier l'album ». Quitter en cours : le
// brouillon reste (« Reprendre l'album » à la prochaine ouverture pour le même événement). Un refus de l'API s'affiche, le flux reste.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { type AlbumView, albumTitle, albumLabels as L } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";
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

  const adopt = useCallback((a: AlbumView) => {
    setAlbum(a);
    setAllowSave(a.allowSave);
    // Le titre servi par défaut n'est pas un titre choisi : le champ reste vide (il montre le titre proposé).
    setTitle(a.title === albumTitle(null, a.event.title) ? "" : a.title);
  }, []);

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
        adopt(a);
        setChosen(a.event.id);
        setStep(2);
      })
      .catch((e) => live && setError(errorMessage(e)));
    return () => {
      live = false;
    };
  }, [resumeId, router, adopt]);

  async function createDraft() {
    if (!eventId) return;
    setBusy(true);
    setError(null);
    try {
      const a = await api.createAlbum({ eventId, title: null });
      adopt(a);
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
      adopt(await api.album(album.id));
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
  const blurred = uploads.batch === "blurred" ? uploads.items.filter((i) => i.rects.length > 0).length : 0;

  return (
    <FlowScreen
      title={step === 1 ? L.newAlbum : step === 2 ? L.photosStep : L.detailsStep}
      facts={step === 1 ? mediaName : (album?.event.title ?? mediaName)}
      onClose={close}
      header={<StepBar step={step} />}
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
          <AlbumStep2Photos uploads={uploads} inAlbum={album.photosCount} onContinue={() => void toDetails()} />
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
