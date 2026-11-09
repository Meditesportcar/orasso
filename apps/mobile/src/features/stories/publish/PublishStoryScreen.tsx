// « Publier une story » (lot R7f3, D38, maquettes R7.8 `p-publier` et R7.22 `s-format`) : une photo, en cinq temps. 1 Média :
// l'appareil plein écran en 9:16 (téléphone) ou la galerie ; 2 « Ajuster » si la photo n'est pas en 9:16 (posée sur un fond
// flouté, pince et glissement) ; 3 la plaque (repérée par ML Kit sur la photo d'origine, décision obligatoire) ; 4 les détails
// (légende, @identification, événement, lieu, voiture, public) ; 5 l'aperçu 9:16 tel que les autres le verront, et « Publier
// pour 24 h ». Envoi : `POST /me/uploads` (photo d'origine, 2048 px au plus) puis `POST /me/stories` ; ta story arrive en tête
// de la barre (`markStoryPublished`). Les JPEG non floutés de l'appli sont effacés dès qu'ils ne servent plus (`tempPhotos`).
// La vidéo vient avec le lot R7g (`VideoSlot`). Casquette active : l'écran publie au nom de la structure ou de la fiche.
import { Icon, SendProgress, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  eventsWithPlace,
  storyPublishLabels as L,
  type StoryAudienceOption,
  type StoryAuthor,
  type StoryCreated,
  sendIfAlive,
  storyAudienceOptions,
  storyBody,
  storyPublishIssue,
} from "@orasso/shared";
import { useCameraPermissions } from "expo-camera";
import { randomUUID } from "expo-crypto";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, BackHandler, Platform, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { usePersona } from "@/lib/persona";
import type { Persona } from "@/lib/personaModel";
import { fitStory, type PickedPhoto, pickPhotos } from "@/lib/photos";
import { detectPlateReadings, surePlates } from "@/lib/plates/detect";
import { useSession } from "@/lib/session";
import { discardTempPhotos, rememberTempPhotos, tempPhotoEpoch } from "@/lib/tempPhotos";
import { useApi } from "@/lib/useApi";
import { SmButton } from "@/ui/Kit";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";
import { withDetection } from "../../fil/publish/model";
import { Capture } from "./Capture";
import { Details } from "./Details";
import { audienceLost, audienceOption, type DetailsState, initialDetails, settleAudience } from "./detailsModel";
import { Fit } from "./Fit";
import {
  newStoryDraft,
  plateOf,
  STORY_DISPLAY_SIDE,
  type StoryDraft,
  type StoryStep,
  stepAfterMedia,
  stepBefore,
} from "./model";
import { Pick } from "./Pick";
import { Plate } from "./Plate";
import { Preview } from "./Preview";
import type { OverlayData } from "./parts";
import { markStoryPublished } from "./publishSignal";
import { withRawShot } from "./shotFiles";

const { space2, space3 } = tokens.spacing;

/** La casquette active → sous quelle casquette la story part (un visiteur ou l'administration publient en passionné). */
export function authorOf(persona: Persona, name: string): StoryAuthor {
  switch (persona.kind) {
    case "organizer":
      return { persona: "organizer", structureId: persona.structureId, name };
    case "pro":
      return { persona: "pro", proId: persona.proProfileId, name };
    case "provider":
      return { persona: "provider", name };
    case "media":
      return { persona: "media", name };
    default:
      return { persona: "fan" };
  }
}

async function uploadStoryPhoto(photo: PickedPhoto): Promise<string> {
  const form = new FormData();
  form.append("purpose", "story");
  if (Platform.OS === "web") {
    const blob = await (await fetch(photo.uri)).blob();
    form.append("file", new File([blob], "story.jpg", { type: "image/jpeg" }));
  } else {
    form.append("file", { uri: photo.uri, name: "story.jpg", type: "image/jpeg" } as unknown as Blob);
  }
  return (await api.upload(form)).key;
}

function confirmLeave(): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(`${L.leaveTitle} ${L.leaveBody}`));
  return new Promise((resolve) =>
    Alert.alert(L.leaveTitle, L.leaveBody, [
      { text: L.leaveStay, style: "cancel", onPress: () => resolve(false) },
      { text: L.leaveGo, style: "destructive", onPress: () => resolve(true) },
    ]),
  );
}

export function PublishStoryScreen() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { me } = useSession();
  const { persona, active } = usePersona();
  const visibility = me?.profile.visibility ?? "public";
  const author = useMemo(() => authorOf(persona, active.label), [persona, active.label]);

  const [step, setStep] = useState<StoryStep>("media");
  const [draft, setDraft] = useState<StoryDraft | null>(null);
  const [details, setDetails] = useState<DetailsState>(() => initialDetails([]));
  const [working, setWorking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<StoryCreated | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  // Photo déjà envoyée (adresse locale → clé) : un nouvel essai ne la renvoie pas. Un clic « Publier » = une seule story.
  const keys = useRef<Record<string, string>>({});
  // Chaque photo abandonnée ouvre une génération : sa détection et ses JPEG tardifs sont jetés à leur arrivée.
  const generation = useRef(0);
  const aliveFor = (gen: number) => {
    const epoch = tempPhotoEpoch();
    return () => gen === generation.current && epoch === tempPhotoEpoch();
  };
  // L'écran est ouvert : faux dès son démontage (une photo qui arrive après n'est jamais gardée).
  const mounted = useRef(true);

  const crews = useApi(() => (author.persona === "fan" ? api.myCrews() : Promise.resolve([])), [author.persona]);
  const vehicles = useApi(() => api.vehicles(), []);
  const applications = useApi(() => api.applications("upcoming"), []);
  const events = eventsWithPlace(applications.data ?? []);
  const activeVehicles = (vehicles.data ?? []).filter((v) => v.status === undefined || v.status === "active");
  const options: StoryAudienceOption[] = useMemo(
    () =>
      storyAudienceOptions(
        author,
        visibility,
        (crews.data ?? []).map((x) => ({ id: x.id, name: x.name, members: x.membersCount })),
      ),
    [author, visibility, crews.data],
  );
  const chosen = audienceOption(options, details.audienceKey);
  // Rien n'est encore choisi : la première option du moment (« Mes abonnés » ou « Public ») s'applique.
  useEffect(() => {
    setDetails((d) => settleAudience(d, options));
  }, [options]);
  // Le public choisi n'existe plus (crew quitté ou supprimé, casquette changée) : il reste affiché comme invalide et rien
  // ne part avant un nouveau choix (jamais de bascule d'office vers « Mes abonnés »).
  const lost = audienceLost(options, details.audienceKey);

  const access: "unknown" | "granted" | "denied" | "unavailable" =
    Platform.OS === "web"
      ? "unavailable"
      : permission?.granted
        ? "granted"
        : permission && !permission.canAskAgain
          ? "denied"
          : "unknown";
  // La permission de l'appareil est demandée à l'ouverture (téléphone seulement).
  useEffect(() => {
    if (Platform.OS !== "web" && permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  const close = useCallback(() => (router.canGoBack() ? router.back() : router.replace("/fil")), [router]);
  const dirty =
    draft !== null || details.caption.trim() !== "" || details.tags.length > 0 || details.place.trim() !== "";
  const leave = useCallback(async () => {
    // Pendant l'envoi, la croix et le retour du téléphone sont inactifs : quitter ne doit pas laisser une story partir seule.
    if (busy) return;
    if (step !== "done" && dirty && !(await confirmLeave())) return;
    close();
  }, [busy, close, dirty, step]);

  // Départ de l'écran : les opérations en cours sont invalidées et les JPEG non floutés du cache effacés.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      discardTempPhotos();
    };
  }, []);

  const goBack = useCallback(() => {
    const before = stepBefore(step, draft?.plate.photo ?? null);
    if (!before) return false;
    if (before === "media") {
      // Retour au choix de la photo : l'ancienne photo (non floutée) est effacée.
      generation.current++;
      discardTempPhotos();
      setDraft(null);
      keys.current = {};
    }
    setError(null);
    setStep(before);
    return true;
  }, [step, draft]);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (busy) return true;
      if (goBack()) return true;
      void leave();
      return true;
    });
    return () => sub.remove();
  }, [busy, goBack, leave]);

  /** Cherche la plaque sur la photo d'origine (jamais sur la copie recadrée : il n'y en a pas). */
  const detect = useCallback(async (key: string, photo: PickedPhoto, gen: number) => {
    let found: Awaited<ReturnType<typeof detectPlateReadings>> = null;
    try {
      found = await detectPlateReadings(photo.uri, photo.width, photo.height);
    } catch {
      found = null;
    }
    if (gen !== generation.current) return;
    const rects = found ? surePlates(found).map((f) => f.rect) : null;
    // Le résultat ne vaut que pour la photo cherchée : une autre photo choisie entre-temps repart de zéro.
    setDraft((d) =>
      d && d.plate.key === key && d.plate.photo.uri === photo.uri ? { ...d, plate: withDetection(d.plate, rects) } : d,
    );
  }, []);

  /** Une photo choisie (galerie) ou prise (appareil) devient le brouillon : copie à 2048 px, détection sur l'original. */
  async function take(source: () => Promise<{ original: PickedPhoto; noted: string[] } | null>) {
    if (working || busy || !mounted.current) return;
    setError(null);
    setWorking(true);
    const gen = ++generation.current;
    const alive = aliveFor(gen);
    let noted: string[] = [];
    try {
      const got = await source();
      if (!got) return;
      noted = got.noted;
      // Ces JPEG ne sont pas floutés : effacés dès qu'ils ne servent plus, tout de suite s'ils arrivent trop tard.
      if (!alive()) return discardTempPhotos(noted);
      rememberTempPhotos(...noted);
      const upload = await fitStory(got.original);
      if (upload.uri !== got.original.uri) {
        noted = [...noted, upload.uri];
        rememberTempPhotos(upload.uri);
      }
      // La copie d'affichage (écrans Ajuster, Plaque, Détails, Aperçu) : l'original n'y sert plus qu'à la détection.
      const display = await fitStory(upload, false, STORY_DISPLAY_SIDE);
      if (display.uri !== upload.uri) {
        noted = [...noted, display.uri];
        rememberTempPhotos(display.uri);
      }
      if (!alive()) return discardTempPhotos(noted);
      // Une photo remplace l'ancienne : celle d'avant est effacée.
      if (draft) discardTempPhotos([draft.plate.photo.uri, draft.upload.uri, draft.display.uri]);
      keys.current = {};
      const next = newStoryDraft(randomUUID(), got.original, upload, display);
      setDraft(next);
      setStep(stepAfterMedia(got.original));
      void detect(next.plate.key, got.original, gen);
    } catch (e) {
      discardTempPhotos(noted);
      if (alive()) setError(errorMessage(e));
    } finally {
      setWorking(false);
    }
  }

  const fromGallery = () =>
    take(async () => {
      const [picked] = await pickPhotos(1, undefined, 4096);
      return picked ? { original: picked, noted: [picked.uri] } : null;
    });

  const fromCamera = async (shot: PickedPhoto) => {
    // La photo brute de l'appareil (non recadrée, non floutée) ne reste jamais : recadrage fait, raté ou écran fermé.
    await withRawShot(shot, () =>
      take(async () => {
        // Le capteur rend du 3:4 ou du 16:9 : recadré au centre en 9:16 exact, sans réduire (la plaque est cherchée dessus).
        const original = await fitStory(shot, true, 4096);
        return { original, noted: [original.uri] };
      }),
    );
  };

  const issue = draft
    ? storyPublishIssue({
        hasPhoto: true,
        preparing: working,
        plate: plateOf(draft),
        caption: details.caption,
        needsCrew: chosen?.audience === "crew" && !chosen.crewId,
        audienceLost: lost,
      })
    : L.missingPhoto;

  async function publish() {
    if (!draft || busy || issue) return;
    // L'écran peut être fermé malgré tout (appli tuée, route quittée) : rien ne part après son démontage.
    const alive = aliveFor(generation.current);
    setBusy(true);
    setError(null);
    setSent(0);
    try {
      const body = (uploadKey: string) =>
        storyBody({
          uploadKey,
          frame: draft.frame,
          rects: draft.plate.rects,
          noPlate: draft.plate.noPlate,
          audience: chosen?.audience ?? "followers",
          crewId: chosen?.crewId ?? null,
          author,
          caption: details.caption,
          place: details.place,
          vehicleId: details.vehicleId,
          eventId: details.eventId,
          tags: details.tags,
        });
      // La photo est envoyée une seule fois (clé gardée) ; ensuite, vérification juste avant la création : un écran démonté
      // (ou un compte purgé) ne publie rien. La création est idempotente côté API : le même envoi repris rend la même story.
      const result = await sendIfAlive(
        alive,
        async () => {
          if (!keys.current[draft.upload.uri]) keys.current[draft.upload.uri] = await uploadStoryPhoto(draft.upload);
          setSent(1);
        },
        // Une réponse perdue peut laisser un 400 « image déjà utilisée » si le premier envoi n'est pas encore enregistré :
        // on refait la requête une fois avec la même clé (elle retrouve la story) avant d'oublier la clé.
        async () => {
          const send = () => api.createStory(body(keys.current[draft.upload.uri] ?? ""));
          try {
            return await send();
          } catch (e) {
            if (e instanceof ApiRequestError && e.status === 400 && e.code !== "plate_decision_required") return send();
            throw e;
          }
        },
      );
      if (!result.sent) return;
      const story = result.value;
      // La story est partie : la barre la montre en tête, les JPEG non floutés s'effacent.
      keys.current = {};
      markStoryPublished(story);
      discardTempPhotos();
      setCreated(story);
      setStep("done");
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 429) setError(L.tooManyRequests);
      else if (e instanceof ApiRequestError && e.isNetwork) setError(L.offline);
      else if (e instanceof ApiRequestError && e.code === "plate_decision_required") {
        // L'API n'a pas vu de décision de plaque : on rouvre l'étape, rien n'est parti.
        setStep("plate");
        setError(e.message);
      } else {
        // Une clé déjà envoyée peut avoir été refusée (image inconnue) : au nouvel essai, tout repart.
        if (e instanceof ApiRequestError && e.status === 400) keys.current = {};
        setError(errorMessage(e));
      }
    } finally {
      setBusy(false);
      setSent(null);
    }
  }

  // --- Étapes plein écran : l'appareil et « Ajuster » ----------------------------------------------------------------
  if (step === "media" && access === "granted") {
    return (
      <Capture
        busy={working}
        onShot={(shot) => void fromCamera(shot)}
        onGallery={() => void fromGallery()}
        onClose={() => void leave()}
      />
    );
  }
  if (step === "fit" && draft) {
    return (
      <Fit
        key={draft.plate.key}
        draft={draft}
        onChange={setDraft}
        onContinue={() => setStep("plate")}
        onCancel={() => void leave()}
      />
    );
  }

  const overlays: OverlayData = {
    caption: details.caption,
    eventTitle: events.find((e) => e.id === details.eventId)?.title ?? null,
    place: details.place.trim() || null,
    vehicle: activeVehicles.find((v) => v.id === details.vehicleId)?.label ?? null,
    tags: details.tags.map((x) => `@${x.pseudo}`),
  };

  if (step === "done" && created) {
    const who = L.doneAudience[chosen?.audience ?? "followers"];
    return (
      <FlowScreen title={L.title} onClose={close}>
        <View style={[styles.done, { backgroundColor: c.surface }]} testID="story-done">
          <Icon name="check" size={28} color={c.accentText} />
          <Text variant="posterM" color={c.ink}>
            {L.done}
          </Text>
          <Text variant="body" color={c.inkMuted}>
            {L.doneText(who)}
          </Text>
          {created.replayed ? (
            <Muted variant="caption">{L.doneReplayed}</Muted>
          ) : created.skipped.length ? (
            <Muted variant="caption">{L.doneSkipped}</Muted>
          ) : null}
        </View>
        <View style={styles.mine}>
          <Icon name="eye" size={20} color={c.inkMuted} />
          <View style={styles.mineText}>
            <Text variant="bodyStrong" color={c.ink}>
              {L.mine}
            </Text>
            <Muted variant="caption">{L.mineHint}</Muted>
          </View>
        </View>
        <SmButton kind="p" big wide icon="feed" onPress={close} testID="story-done-back">
          {L.backToFeed}
        </SmButton>
      </FlowScreen>
    );
  }

  // --- Étapes en page : choix de la photo, plaque, détails, aperçu ---------------------------------------------------
  const onPlateStep = step === "plate";
  const primary =
    step === "plate"
      ? { label: L.plateValidate, icon: "check" as const, onPress: () => setStep("details") }
      : step === "details"
        ? { label: L.toPreview, icon: "eye" as const, onPress: () => setStep("preview") }
        : step === "preview"
          ? { label: L.publish, icon: "send" as const, onPress: () => void publish() }
          : null;
  // « Valider » (plaque) ne demande que la plaque ; « Aperçu » et « Publier » demandent tout.
  const plateOnly = draft
    ? storyPublishIssue({ hasPhoto: true, preparing: working, plate: plateOf(draft), caption: "" })
    : L.missingPhoto;
  const blocking = step === "plate" ? plateOnly : issue;

  return (
    <FlowScreen
      title={L.title}
      facts={L.subtitle}
      onClose={() => void leave()}
      footer={
        primary ? (
          <View style={styles.footer}>
            {busy && sent !== null ? (
              <View style={styles.progress}>
                <SendProgress size={44} ring={false} progress={sent / 2} />
                <Muted variant="caption" testID="story-progress">
                  {sent < 1 ? L.sending : L.publishing}
                </Muted>
              </View>
            ) : blocking ? (
              <Muted variant="caption" testID="story-missing">
                {blocking}
              </Muted>
            ) : null}
            <SmButton
              kind="p"
              big
              wide
              icon={primary.icon}
              disabled={busy || Boolean(blocking)}
              onPress={primary.onPress}
              testID={
                step === "preview" ? "story-publish" : step === "details" ? "story-to-preview" : "story-plate-validate"
              }
            >
              {primary.label}
            </SmButton>
            {step === "preview" ? (
              <SmButton
                kind="s"
                wide
                icon="edit"
                disabled={busy}
                onPress={() => setStep("details")}
                testID="story-preview-back"
              >
                {L.previewBack}
              </SmButton>
            ) : null}
          </View>
        ) : undefined
      }
    >
      {step === "media" ? (
        <Pick
          camera={access}
          busy={working}
          error={error}
          onGallery={() => void fromGallery()}
          onCamera={() => void requestPermission()}
        />
      ) : null}
      {draft && onPlateStep ? (
        <Plate draft={draft} onPlate={(plate) => setDraft((d) => (d ? { ...d, plate } : d))} locked={busy} />
      ) : null}
      {draft && step === "details" ? (
        <Details
          draft={draft}
          details={details}
          onDetails={setDetails}
          author={author}
          visibility={visibility}
          options={options}
          vehicles={activeVehicles.map((v) => ({ id: v.id, label: v.label }))}
          events={events}
          locked={busy}
        />
      ) : null}
      {draft && step === "preview" ? <Preview draft={draft} overlays={overlays} /> : null}
      {step !== "media" && error ? <Notice tone="error">{error}</Notice> : null}
      {draft ? null : step !== "media" ? <Muted variant="caption">{L.missingPhoto}</Muted> : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  footer: { gap: space2 },
  progress: { flexDirection: "row", alignItems: "center", gap: space2 },
  done: { gap: space2, padding: space3, borderRadius: tokens.radius.radiusLg, alignItems: "flex-start" },
  mine: { flexDirection: "row", alignItems: "center", gap: space3 },
  mineText: { flex: 1, gap: 2 },
});
