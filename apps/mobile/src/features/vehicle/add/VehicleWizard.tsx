// Ajouter ou modifier un véhicule en cinq étapes (lot 51, prototype `s-vadd` ; lot M1, maquettes 1.1 à 1.9 validées
// par Damien le 23/10). Ordre de Damien : (1) photos au carré, recadrées avec notre écran, (2) plaque masquée et numéro
// privé, (3) type, marque › modèle › génération de la liste Orasso, (4) fiche technique (motorisation du catalogue,
// année, nuancier, description, préparation), (5) catégories, puis « Envoyer ». La fiche se construit en tête de chaque
// étape, sous la barre de progression moutarde. Envoi : création (ou modification), puis les photos une à une avec
// leurs cadres de plaque (floutées par l'API, définitivement) ; la voiture drifte autour du O, compacte, le
// pourcentage à côté, et se gare à 100 % ; puis « au garage ». Fin : « Tes préférences » la première fois.
import { Button, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  vehicleWizardLabels as L,
  vehicleAddLabels as V,
  type VehicleFull,
  type VehiclePreparation,
} from "@orasso/shared";
import { randomUUID } from "expo-crypto";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { ConfirmSheet } from "@/features/orga/ConfirmSheet";
import { ShareSheet } from "@/features/vehicle/ShareSheet";
import { api } from "@/lib/api";
import { appReturn } from "@/lib/closeTo";
import { errorMessage } from "@/lib/http";
import { cropSquare, type PickedPhoto, photoForm, pickPhotos, takePhoto, VEHICLE_SOURCE_SIDE } from "@/lib/photos";
import { detectPlateReadings } from "@/lib/plates/detect";
import { PREFERENCES_FIRST_ROUTE, routeAfterFirstVehicle } from "@/lib/preferences";
import { useSession } from "@/lib/session";
import { centerCrop, cropPixels, type SquareCrop } from "@/lib/squareCrop";
import { useApi } from "@/lib/useApi";
import { waitUploadParked } from "@/ui/PhotoGrid";
import { FlowScreen } from "@/ui/Screens";
import { SquareCropper } from "@/ui/SquareCropper";
import { LiveCard } from "./LiveCard";
import {
  applyMode,
  type BlurMode,
  continueBlocked,
  type Draft,
  type DraftPhoto,
  detectionUnavailable,
  draftFromVehicle,
  draftIsEmpty,
  emptyDraft,
  keptCategories,
  liveCard,
  MAX_PHOTOS,
  modelsForType,
  nextMove,
  preparedCategory,
  STEP,
  STEP_COUNT,
  shortName,
  stepIssue,
  stepOfError,
  stepToRevisit,
  updateBody,
  withCover,
} from "./model";
import { SquareButton } from "./parts";
import { detectionPatch } from "./plateStep";
import { DoneView, type PhotoState, SendingView } from "./SendViews";
import { type PhotoSource, StepPhotos } from "./StepPhotos";
import { photoToFix, StepPlate } from "./StepPlate";
import { StepCategories, StepIdentity, StepSpecs } from "./Steps";
import { DraftIncomplete, newSendMemo, photoPlan, runSend, type SendApi } from "./send";

const { space2 } = tokens.spacing;

/**
 * Lot M1 : après le premier véhicule, l'étape « Tes préférences » (route du lot M6). Lot M6, tour 4 : branchée ; le
 * bouton suit la règle « première fois » (`routeAfterFirstVehicle` : l'étape si jamais vue, sinon l'Explorer).
 */
const PREFERENCES_ROUTE: string | null = PREFERENCES_FIRST_ROUTE;

type Phase = "steps" | "crop" | "sending" | "done";

let photoSeq = 0;

export function VehicleWizard({ vehicle }: { vehicle?: VehicleFull }) {
  const { t } = useTheme();
  const router = useRouter();
  const { retour } = useLocalSearchParams<{ retour?: string }>();
  const { refreshMe, me } = useSession();
  const editing = Boolean(vehicle);
  // La première fois (aucun véhicule avant l'ajout) : « Tes préférences » à la fin.
  const firstTime = useRef(!editing && (me?.counts.vehicles ?? 0) === 0).current;
  const [draft, setDraft] = useState<Draft>(() => (vehicle ? draftFromVehicle(vehicle) : emptyDraft()));
  const [step, setStep] = useState<number>(STEP.photos);
  const [phase, setPhase] = useState<Phase>("steps");
  const [progress, setProgress] = useState({ done: 0, total: 0, complete: false });
  const [photoStates, setPhotoStates] = useState<Record<string, PhotoState>>({});
  const [error, setError] = useState<string | null>(null);
  // Lot M2 (retour 15) : le blocage de l'étape se relit à chaque changement, il disparaît dès que c'est réglé.
  const [issueShown, setIssueShown] = useState(false);
  const [saved, setSaved] = useState<VehicleFull | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Recadrage : file des photos à cadrer (import) ou une seule (bouton Recadrer).
  const [cropQueue, setCropQueue] = useState<string[]>([]);
  const [cropBusy, setCropBusy] = useState(false);
  // Étape Plaque : « Continuer » ouvre la photo à régler (maquette 1.3).
  const [plateFocus, setPlateFocus] = useState<{ index: number; tick: number } | null>(null);
  // Envoi interrompu (réseau) : on reprend sans recréer le véhicule (clé client) ni renvoyer les photos déjà parties ;
  // une photo recadrée depuis est remplacée en ligne (lot M1, tour 2, voir `send.ts`).
  const [memo] = useState(() => newSendMemo(randomUUID(), vehicle));
  // Quitter (lot M1, tour 2) : un brouillon non vide ou un envoi en cours se confirme ; `leaving` laisse passer.
  const [quitting, setQuitting] = useState(false);
  const leaving = useRef(false);
  const pendingLeave = useRef<(() => void) | null>(null);

  const patch = (change: Partial<Draft>) => setDraft((d) => ({ ...d, ...change }));

  const makes = useApi(() => api.makes(), [], { cacheKey: "ref.makes" });
  const models = useApi(() => api.models(draft.makeId ?? ""), [draft.makeId], { enabled: Boolean(draft.makeId) });
  const generations = useApi(() => api.generations(draft.modelId ?? ""), [draft.modelId], {
    enabled: Boolean(draft.modelId),
  });
  const categories = useApi(
    () =>
      api.categories({
        makeId: draft.makeId,
        modelId: draft.modelId,
        vehicleType: draft.vehicleType,
        year: draft.year,
      }),
    [draft.makeId, draft.modelId, draft.vehicleType, draft.year],
  );

  const make = makes.data?.find((m) => m.id === draft.makeId);
  const modelRows = useMemo(
    () => modelsForType(models.data ?? [], draft.vehicleType),
    [models.data, draft.vehicleType],
  );
  const model = modelRows.find((m) => m.id === draft.modelId);
  const generation = generations.data?.find((g) => g.id === draft.generationId);
  const makeCountry = make && !make.isOther ? make.country : null;
  // Un modèle sans génération dans la liste : rien à choisir.
  useEffect(() => {
    if (draft.modelId && generations.data && generations.data.length === 0 && draft.generationId === undefined) {
      setDraft((d) => ({ ...d, generationId: null }));
    }
  }, [draft.modelId, draft.generationId, generations.data]);

  // L'origine se déduit de la marque ; un style qui ne convient plus (type, marque, année changés) est retiré.
  useEffect(() => {
    const rows = categories.data;
    if (!rows) return;
    setDraft((d) => {
      const next = keptCategories(d.categoryIds, rows, makeCountry);
      const same = next.length === d.categoryIds.length && next.every((id, i) => id === d.categoryIds[i]);
      return same ? d : { ...d, categoryIds: next };
    });
  }, [categories.data, makeCountry]);

  // Pendant l'import ou le recadrage d'une photo, « Continuer » attend (lot M1, tour 2, vie privée de la plaque).
  const importing = busy || cropBusy || phase === "crop";
  // Brouillon à protéger : saisi (ajout), ou modifié (fiche existante : champ, photo ajoutée, retirée ou floutée).
  const dirty = vehicle
    ? Object.keys(updateBody(draft, vehicle)).length > 0 || photoPlan(draft, vehicle.photos, memo).length > 0
    : !draftIsEmpty(draft);
  const guarded = phase === "sending" || (phase !== "done" && dirty);
  const leave = () => {
    leaving.current = true;
    const action = pendingLeave.current;
    pendingLeave.current = null;
    if (action) return action();
    // Lot M7 : le ✕ revient à l'écran d'origine (la pile), sinon au `?retour=` sûr, sinon au Garage.
    return router.canGoBack() ? router.back() : router.replace((appReturn(retour) ?? "/(tabs)/garage") as never);
  };
  const close = () => (guarded ? setQuitting(true) : leave());
  // ✕, retour Android ou geste : même confirmation tant que le brouillon n'est pas vide ou que l'envoi tourne.
  const navigation = useNavigation();
  useEffect(() => {
    if (!guarded) return;
    return navigation.addListener("beforeRemove", (e) => {
      if (leaving.current) return;
      e.preventDefault();
      pendingLeave.current = () => navigation.dispatch(e.data.action);
      setQuitting(true);
    });
  }, [navigation, guarded]);
  const card = liveCard(draft, editing ? STEP.categories : step, {
    make,
    model,
    generation,
    categories: categories.data ?? [],
  });

  // --- Photos, recadrage et détection ---------------------------------------------------------------------------------
  function updatePhoto(key: string, change: (p: DraftPhoto) => DraftPhoto) {
    setDraft((d) => ({ ...d, photos: d.photos.map((p) => (p.key === key ? change(p) : p)) }));
  }

  /** Repérage de la plaque sur l'appareil (rien ne part au serveur) ; un résultat d'une ancienne photo est ignoré. */
  async function detect(key: string, photo: PickedPhoto) {
    const found = await detectPlateReadings(photo.uri, photo.width, photo.height).catch(() => null);
    setDraft((d) => {
      const photos = d.photos.map((x) =>
        x.key === key && x.uri === photo.uri ? { ...x, ...detectionPatch(x, found, d.blurMode) } : x,
      );
      const next = { ...d, photos };
      // Relecture : aucune détection possible ici (web, Expo Go) → « À la main », sans promesse d'automatique.
      return detectionUnavailable(next.photos) ? { ...next, blurMode: "manual" } : next;
    });
  }

  /** Le carré choisi devient la photo envoyée : les cadres et la décision de plaque repartent de zéro. */
  async function applyCrop(key: string, source: PickedPhoto, crop: SquareCrop) {
    const square = await cropSquare(source, cropPixels(source.width, source.height, crop));
    updatePhoto(key, (p) => ({
      ...p,
      uri: square.uri,
      width: square.width,
      height: square.height,
      source: { ...source, crop },
      rects: [],
      detected: undefined,
      readings: undefined,
      noPlate: false,
      detection: "pending",
    }));
    void detect(key, square);
  }

  async function addPhotos(from: PhotoSource) {
    setError(null);
    setBusy(true);
    try {
      const room = MAX_PHOTOS - draft.photos.length;
      const picked = (
        from === "camera" ? await takePhoto(VEHICLE_SOURCE_SIDE) : await pickPhotos(room, undefined, VEHICLE_SOURCE_SIDE)
      ).slice(0, room);
      const added: { key: string; source: PickedPhoto; square: PickedPhoto; crop: SquareCrop }[] = [];
      for (const p of picked) {
        // Format maître carré (décision de Damien, retour 10) : carré centré d'abord, ajustable tout de suite.
        const crop = centerCrop(p.width, p.height);
        const square = await cropSquare(p, cropPixels(p.width, p.height, crop));
        added.push({ key: `local-${photoSeq++}`, source: p, square, crop });
      }
      setDraft((d) => ({
        ...d,
        photos: [
          ...d.photos,
          ...added.map(
            (a): DraftPhoto => ({
              key: a.key,
              uri: a.square.uri,
              width: a.square.width,
              height: a.square.height,
              source: { ...a.source, crop: a.crop },
              rects: [],
              detection: "pending",
            }),
          ),
        ].slice(0, MAX_PHOTOS),
      }));
      for (const a of added) void detect(a.key, a.square);
      if (added.length) {
        setCropQueue(added.map((a) => a.key));
        setPhase("crop");
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const cropping = phase === "crop" ? draft.photos.find((p) => p.key === cropQueue[0] && p.source) : undefined;
  // Photo retirée pendant le recadrage : on revient aux étapes.
  useEffect(() => {
    if (phase === "crop" && !cropping) setPhase("steps");
  }, [phase, cropping]);
  const nextCrop = () => {
    setCropQueue((q) => {
      const rest = q.slice(1);
      if (!rest.length) setPhase("steps");
      return rest;
    });
  };

  // Une photo ajoutée ou recadrée après l'étape Plaque (ou une détection qui repart) ramène à cette étape : rien ne
  // part sans masque ni « aucune plaque » confirmé (lot M1, tour 2).
  useEffect(() => {
    if (phase !== "steps" || importing) return;
    const back = stepToRevisit(draft, step);
    if (back === null) return;
    setStep(back);
    setIssueShown(true);
    if (back === STEP.plate) {
      const target = photoToFix(draft);
      if (target >= 0) setPlateFocus({ index: target, tick: Date.now() });
    }
  }, [phase, importing, draft, step]);

  function setMode(mode: BlurMode) {
    setDraft((d) =>
      mode === "auto" && detectionUnavailable(d.photos)
        ? d
        : { ...d, blurMode: mode, photos: applyMode(d.photos, mode) },
    );
  }

  /** Une préparation choisie coche « Préparée » (maquette 1.7), si la catégorie convient à ce véhicule. */
  function onPreparation(items: VehiclePreparation[]) {
    const prepared = preparedCategory(categories.data ?? []);
    if (!items.length || !prepared) return;
    setDraft((d) =>
      d.categoryIds.includes(prepared.id) ? d : { ...d, categoryIds: [...d.categoryIds, prepared.id].slice(0, 10) },
    );
  }

  // --- Étapes --------------------------------------------------------------------------------------------------------
  /** Montre ce qui manque à l'étape `at` ; à l'étape Plaque, ouvre la photo à régler. */
  function showIssue(at: number) {
    setIssueShown(true);
    if (at !== step) setStep(at);
    if (at === STEP.plate) {
      const target = photoToFix(draft);
      if (target >= 0) setPlateFocus({ index: target, tick: Date.now() });
    }
  }

  function next() {
    const move = nextMove(step, draft, importing);
    if (move.kind === "wait") return;
    setError(null);
    if (move.kind === "fix") return showIssue(move.step);
    setIssueShown(false);
    if (move.kind === "step") setStep(move.step);
    else void send();
  }

  function previous() {
    setError(null);
    setIssueShown(false);
    if (step === 0) close();
    else setStep(step - 1);
  }

  // --- Envoi ---------------------------------------------------------------------------------------------------------
  const sendApi: SendApi = {
    create: (body) => api.createVehicle(body),
    update: (id, body) => api.updateVehicle(id, body),
    get: (id) => api.vehicle(id),
    upload: async (id, photo, fields, index) => {
      const form = await photoForm({ uri: photo.uri, width: photo.width, height: photo.height }, index);
      if ("plateRects" in fields) form.append("plateRects", JSON.stringify(fields.plateRects));
      else form.append("noPlate", "true");
      return api.uploadVehiclePhoto(id, form);
    },
    blur: (id, photoId, rects) => api.blurVehiclePhoto(id, photoId, rects),
    remove: (id, photoId) => api.deleteVehiclePhoto(id, photoId),
    reorder: (id, photoIds) => api.reorderVehiclePhotos(id, photoIds),
  };

  async function send() {
    setPhase("sending");
    setError(null);
    setProgress({ done: 0, total: 0, complete: false });
    try {
      const current = await runSend(draft, vehicle?.photos ?? [], memo, sendApi, {
        progress: (done, total) => setProgress({ done, total, complete: false }),
        photo: (key, state) => setPhotoStates((st) => ({ ...st, [key]: state })),
      });
      // La voiture finit son tour et se gare dans le O.
      setProgress((p) => ({ done: p.total, total: p.total, complete: true }));
      await waitUploadParked();
      // Lot 40 : le premier véhicule actif fait passer de visiteur à exposant.
      await refreshMe().catch(() => undefined);
      setSaved(current);
      setPhase("done");
    } catch (e) {
      // Brouillon incomplet (photo sans décision de plaque…) : rien n'est parti pour elle, retour à son étape.
      if (e instanceof DraftIncomplete) {
        setPhase("steps");
        showIssue(e.step);
        return;
      }
      // Relecture : une erreur sur un champ (plaque déjà prise, valeur refusée, photo illisible) ramène à son étape,
      // brouillon gardé ; une panne réseau ou serveur reste sur l'envoi avec « Reprendre ».
      const back = stepOfError(e);
      if (back !== null) {
        setPhase("steps");
        setStep(back);
      }
      setError(errorMessage(e));
    }
  }

  const title = editing ? L.editTitle : L.title;
  const bar = (pct: number) => <ProgressBar pct={pct} />;
  const quitSheet = (
    <ConfirmSheet
      visible={quitting}
      title={phase === "sending" ? V.quitSendingTitle : V.quitTitle}
      body={phase === "sending" ? V.quitSendingBody : editing ? V.quitEditBody : V.quitBody}
      confirmLabel={V.quitConfirm}
      confirmIcon="back"
      cancelLabel={V.quitKeep}
      onConfirm={() => {
        setQuitting(false);
        leave();
      }}
      onClose={() => {
        pendingLeave.current = null;
        setQuitting(false);
      }}
    />
  );

  // --- Rendu ---------------------------------------------------------------------------------------------------------
  if (phase === "crop" && cropping) {
    const index = draft.photos.findIndex((p) => p.key === cropping.key);
    const source = cropping.source as NonNullable<DraftPhoto["source"]>;
    return (
      <SquareCropper
        key={cropping.key}
        photo={source}
        initial={source.crop}
        subtitle={V.cropOf(index + 1, draft.photos.length)}
        busy={cropBusy}
        onCancel={() => {
          setCropQueue([]);
          setPhase("steps");
        }}
        onConfirm={async (crop) => {
          const same =
            Math.abs(crop.x - source.crop.x) < 1e-4 &&
            Math.abs(crop.y - source.crop.y) < 1e-4 &&
            Math.abs(crop.size - source.crop.size) < 1e-4;
          if (!same) {
            setCropBusy(true);
            try {
              await applyCrop(cropping.key, source, crop);
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setCropBusy(false);
            }
          }
          nextCrop();
        }}
      />
    );
  }

  if (phase === "done" && saved) {
    const name = shortName({ make, model }, draft.vehicleType);
    const full = liveCard(draft, STEP.categories, { make, model, generation, categories: categories.data ?? [] });
    const doneTitle = editing ? L.doneTitleEdit : L.doneTitle(name);
    const seeVehicle = editing || memo.pending;
    return (
      <FlowScreen
        title={title}
        facts={V.done}
        header={bar(100)}
        onClose={() => router.replace(memo.pending ? `/vehicule/${saved.id}` : "/(tabs)/garage")}
        footer={
          <>
            {seeVehicle ? (
              <Button
                variant="primary"
                icon="next"
                onPress={() => router.replace(`/vehicule/${saved.id}`)}
                fullWidth
                testID="vehicle-done-see"
              >
                {L.seeVehicle}
              </Button>
            ) : firstTime && PREFERENCES_ROUTE ? (
              <Button
                variant="primary"
                icon="next"
                onPress={() => void routeAfterFirstVehicle().then((to) => router.replace(to as never))}
                fullWidth
                testID="vehicle-done-preferences"
              >
                {V.preferences}
              </Button>
            ) : (
              <Button
                variant="primary"
                icon="vehicle"
                onPress={() => router.replace("/(tabs)/garage")}
                fullWidth
                testID="vehicle-done-garage"
              >
                {V.backToGarage}
              </Button>
            )}
            <Button
              variant="secondary"
              icon="share"
              onPress={() => setShareOpen(true)}
              fullWidth
              testID="vehicle-done-share"
            >
              {V.share}
            </Button>
          </>
        }
        overlays={
          <ShareSheet
            vehicleId={saved.id}
            version={saved.shareVersion}
            visible={shareOpen}
            onClose={() => setShareOpen(false)}
          />
        }
      >
        <DoneView
          title={doneTitle}
          cover={saved.photos[0]?.url ?? null}
          remoteCover
          name={full.name ?? name}
          specs={[full.generation?.split(" · ")[0], full.specs].filter(Boolean).join(" · ") || null}
          categories={full.categories}
        />
      </FlowScreen>
    );
  }

  if (phase === "sending") {
    return (
      <FlowScreen
        title={title}
        facts={V.sending}
        header={bar(100)}
        onClose={close}
        overlays={quitSheet}
        footer={
          error ? (
            <>
              <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
                {error}
              </Text>
              <Button variant="primary" icon="undo" onPress={() => void send()} fullWidth testID="vehicle-resume">
                {L.resume}
              </Button>
            </>
          ) : undefined
        }
      >
        <SendingView
          done={progress.done}
          total={progress.total}
          complete={progress.complete}
          photos={draft.photos}
          states={photoStates}
        />
      </FlowScreen>
    );
  }

  const issue = stepIssue(step, draft);
  const shownError = error ?? (issueShown ? issue : null);
  // Maquettes 1.1 et 1.5 : « Continuer » grisé tant qu'il n'y a pas de photo, ou que le choix n'est pas fait ; lot M1,
  // tour 2 : aussi pendant l'import ou le recadrage d'une photo.
  const blocked = continueBlocked(step, draft, importing);
  const last = step === STEP_COUNT - 1;
  return (
    <FlowScreen
      title={title}
      facts={V.stepOf(step + 1, STEP_COUNT, V.steps[step] ?? "")}
      onClose={close}
      overlays={quitSheet}
      header={
        <>
          {bar(((step + 1) / STEP_COUNT) * 100)}
          <LiveCard card={card} remoteCover={Boolean(draft.photos[0]?.remoteId)} />
        </>
      }
      footer={
        <>
          {shownError && !blocked && (step !== STEP.plate || error) ? (
            <Text variant="caption" color={t.color.winText} accessibilityRole="alert" testID="vehicle-step-error">
              {shownError}
            </Text>
          ) : null}
          <View style={styles.footer}>
            <SquareButton
              icon={step === 0 ? "close" : "back"}
              label={step === 0 ? V.close : V.back}
              onPress={previous}
              testID="vehicle-step-back"
            />
            <View style={styles.grow}>
              <Button
                variant="primary"
                icon={last ? (editing ? "check" : "upload") : "next"}
                onPress={next}
                disabled={blocked}
                fullWidth
                testID="vehicle-step-next"
                accessibilityHint={issue ?? undefined}
              >
                {last ? (editing ? L.save : V.send) : L.next}
              </Button>
            </View>
          </View>
          {blocked && (importing || step === STEP.photos) ? (
            <Text variant="caption" color={t.color.inkMuted} style={styles.why} testID="vehicle-step-why">
              {importing ? V.importing : issue}
            </Text>
          ) : null}
        </>
      }
    >
      {step === STEP.photos ? (
        <StepPhotos
          draft={draft}
          busy={busy}
          onAdd={(from) => void addPhotos(from)}
          onRemove={(i) => setDraft((d) => ({ ...d, photos: d.photos.filter((_, j) => j !== i) }))}
          onCover={(i) => setDraft((d) => ({ ...d, photos: withCover(d.photos, i) }))}
          onCrop={(i) => {
            const key = draft.photos[i]?.key;
            if (!key) return;
            setCropQueue([key]);
            setPhase("crop");
          }}
        />
      ) : null}
      {step === STEP.plate ? (
        <StepPlate
          draft={draft}
          patch={patch}
          onMode={setMode}
          focus={plateFocus}
          issue={issue}
          issueShown={issueShown}
          onAddPhotos={draft.photos.length < MAX_PHOTOS ? () => setStep(STEP.photos) : undefined}
          onRects={(i, rects) => {
            const key = draft.photos[i]?.key;
            if (key) updatePhoto(key, (p) => ({ ...p, rects, noPlate: rects.length ? false : p.noPlate }));
          }}
          onNoPlate={(i, noPlate) => {
            const key = draft.photos[i]?.key;
            if (key) updatePhoto(key, (p) => ({ ...p, noPlate }));
          }}
        />
      ) : null}
      {step === STEP.identity ? (
        <StepIdentity
          draft={draft}
          patch={patch}
          makes={makes.data ?? []}
          models={modelRows}
          generations={generations.data ?? []}
        />
      ) : null}
      {step === STEP.specs ? (
        <StepSpecs draft={draft} patch={patch} generation={generation} onPreparation={onPreparation} />
      ) : null}
      {step === STEP.categories ? (
        <StepCategories draft={draft} patch={patch} categories={categories.data ?? []} make={make} />
      ) : null}
    </FlowScreen>
  );
}

/** Barre de progression moutarde de la `.flowbar` (« Étape 3 sur 5 »), sous le titre, à gauche du ✕. */
function ProgressBar({ pct }: { pct: number }) {
  const { t } = useTheme();
  return (
    <View
      style={[styles.track, { backgroundColor: t.color.line }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
      testID="vehicle-progress"
    >
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: t.color.accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: "row", gap: space2, alignItems: "center" },
  grow: { flex: 1 },
  why: { textAlign: "center" },
  track: { height: 6, borderRadius: tokens.radius.radiusPill, overflow: "hidden", marginRight: 48, marginTop: -4 },
  fill: { height: "100%", borderRadius: tokens.radius.radiusPill },
});
