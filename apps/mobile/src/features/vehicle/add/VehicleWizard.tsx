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
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { ShareSheet } from "@/features/vehicle/ShareSheet";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { cropSquare, type PickedPhoto, photoForm, pickPhotos, takePhoto } from "@/lib/photos";
import { detectPlateReadings } from "@/lib/plates/detect";
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
  createBody,
  type Draft,
  type DraftPhoto,
  detectionUnavailable,
  draftFromVehicle,
  emptyDraft,
  keptCategories,
  liveCard,
  MAX_PHOTOS,
  modelsForType,
  photoPlan,
  preparedCategory,
  STEP,
  STEP_COUNT,
  shortName,
  stepIssue,
  stepOfError,
  updateBody,
  withCover,
} from "./model";
import { SquareButton } from "./parts";
import { detectionPatch } from "./plateStep";
import { DoneView, type PhotoState, SendingView } from "./SendViews";
import { type PhotoSource, StepPhotos } from "./StepPhotos";
import { photoToFix, StepPlate } from "./StepPlate";
import { StepCategories, StepIdentity, StepSpecs } from "./Steps";

const { space2 } = tokens.spacing;

/**
 * Lot M1 : après le premier véhicule, l'étape « Tes préférences » (route créée par le lot M6). Tant qu'elle n'existe
 * pas sur cette branche : `null`, et le bouton principal ramène au garage.
 */
const PREFERENCES_ROUTE: string | null = null;

type Phase = "steps" | "crop" | "sending" | "done";

let photoSeq = 0;

export function VehicleWizard({ vehicle }: { vehicle?: VehicleFull }) {
  const { t } = useTheme();
  const router = useRouter();
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
  // Envoi interrompu (réseau) : on reprend sans recréer le véhicule ni renvoyer les photos déjà parties.
  const sent = useRef<{
    vehicleId: string | null;
    /** Fiche telle que l'API la connaît (créée ou modifiée) : la reprise n'envoie que ce qui a changé depuis. */
    base: VehicleFull | null;
    done: Set<string>;
    pending: boolean;
    /** Photo locale envoyée → identifiant de la photo en ligne (ordre final). */
    uploaded: Map<string, string>;
    /** Envoi de photo dont la réponse n'est pas arrivée : à vérifier avant de la renvoyer (pas de doublon). */
    inFlight: { key: string; before: string[] } | null;
  }>({
    vehicleId: vehicle?.id ?? null,
    base: vehicle ?? null,
    done: new Set(),
    pending: false,
    uploaded: new Map(),
    inFlight: null,
  });

  const patch = (change: Partial<Draft>) => setDraft((d) => ({ ...d, ...change }));

  const makes = useApi(() => api.makes(), [], { cacheKey: "ref.makes" });
  const models = useApi(() => api.models(draft.makeId ?? ""), [draft.makeId], { enabled: Boolean(draft.makeId) });
  const generations = useApi(() => api.generations(draft.modelId ?? ""), [draft.modelId], {
    enabled: Boolean(draft.modelId),
  });
  const categories = useApi(
    () => api.categories({ makeId: draft.makeId, vehicleType: draft.vehicleType, year: draft.year }),
    [draft.makeId, draft.vehicleType, draft.year],
  );

  const make = makes.data?.find((m) => m.id === draft.makeId);
  const modelRows = useMemo(
    () => modelsForType(models.data ?? [], draft.vehicleType),
    [models.data, draft.vehicleType],
  );
  const model = modelRows.find((m) => m.id === draft.modelId);
  const generation = generations.data?.find((g) => g.id === draft.generationId);
  const makeCountry = make && !make.isOther ? make.country : null;
  // Lot M1 : motorisations du catalogue Orasso de la génération choisie.
  const realGeneration = generation && !generation.isOther ? generation.id : null;
  const engines = useApi(() => api.engines(realGeneration ?? ""), [realGeneration], {
    enabled: Boolean(realGeneration),
  });

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

  const close = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/garage"));
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
      const picked = (from === "camera" ? await takePhoto() : await pickPhotos(room)).slice(0, room);
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
  function next() {
    const issue = stepIssue(step, draft);
    setError(null);
    setIssueShown(Boolean(issue));
    if (issue && step === STEP.plate) {
      const target = photoToFix(draft);
      if (target >= 0) setPlateFocus({ index: target, tick: Date.now() });
    }
    if (issue) return;
    if (step < STEP_COUNT - 1) setStep(step + 1);
    else void send();
  }

  function previous() {
    setError(null);
    setIssueShown(false);
    if (step === 0) close();
    else setStep(step - 1);
  }

  // --- Envoi ---------------------------------------------------------------------------------------------------------
  async function send() {
    setPhase("sending");
    setError(null);
    const s = sent.current;
    let ops = photoPlan(draft, vehicle?.photos ?? []).filter((op) => !s.done.has(opKey(op)));
    let total = ops.length;
    setProgress({ done: 0, total, complete: false });
    try {
      let current: VehicleFull | null = null;
      if (!s.vehicleId) {
        current = await api.createVehicle(createBody(draft));
        s.vehicleId = current.id;
        s.base = current;
        s.pending = Boolean(current.plateTransfer);
      } else if (s.base) {
        // Modification, ou reprise après une erreur corrigée : seulement ce qui a changé depuis la dernière fiche.
        const body = updateBody(draft, s.base);
        if (Object.keys(body).length) {
          current = await api.updateVehicle(s.vehicleId, body);
          s.base = current;
          s.pending = Boolean(current.plateTransfer);
        }
      }
      const id = s.vehicleId as string;
      current ??= await api.vehicle(id);
      // Réponse perdue pendant un envoi de photo : si la photo est arrivée, on la garde au lieu de la renvoyer.
      if (s.inFlight) {
        const before = new Set(s.inFlight.before);
        const known = new Set(s.uploaded.values());
        const arrived = current.photos.find((p) => !before.has(p.id) && !known.has(p.id));
        if (arrived) {
          s.uploaded.set(s.inFlight.key, arrived.id);
          s.done.add(`upload:${s.inFlight.key}`);
        }
        s.inFlight = null;
      }
      // Photos envoyées : leur identifiant, pour poser l'ordre final (couverture en tête).
      const uploaded = s.uploaded;
      ops = ops.filter((op) => !s.done.has(opKey(op)));
      total = ops.length;
      setProgress({ done: 0, total, complete: false });
      let n = 0;
      for (const op of ops) {
        if (op.kind === "remove") {
          await api.deleteVehiclePhoto(id, op.photoId);
        } else if (op.kind === "upload") {
          const photo = draft.photos.find((p) => p.key === op.key);
          if (photo) {
            setPhotoStates((st) => ({ ...st, [op.key]: "sending" }));
            const form = await photoForm({ uri: photo.uri, width: photo.width, height: photo.height }, n);
            if (op.rects.length) form.append("plateRects", JSON.stringify(op.rects));
            const before = new Set(current.photos.map((p) => p.id));
            s.inFlight = { key: op.key, before: [...before] };
            const after = await api.uploadVehiclePhoto(id, form);
            s.inFlight = null;
            const added = after.photos.find((p) => !before.has(p.id));
            if (added) uploaded.set(op.key, added.id);
            current = after;
            setPhotoStates((st) => ({ ...st, [op.key]: "done" }));
          }
        } else {
          current = await api.blurVehiclePhoto(id, op.photoId, op.rects);
        }
        s.done.add(opKey(op));
        n++;
        setProgress({ done: n, total, complete: false });
      }
      // Ordre final : la couverture choisie en tête.
      const order = draft.photos.map((p) => p.remoteId ?? uploaded.get(p.key)).filter((x): x is string => Boolean(x));
      const currentOrder = current.photos.map((p) => p.id);
      if (order.length > 1 && order.join() !== currentOrder.join()) {
        current = await api.reorderVehiclePhotos(id, order);
      }
      // La voiture finit son tour et se gare dans le O.
      setProgress({ done: total, total, complete: true });
      await waitUploadParked();
      // Lot 40 : le premier véhicule actif fait passer de visiteur à exposant.
      await refreshMe().catch(() => undefined);
      setSaved(current);
      setPhase("done");
    } catch (e) {
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
    const seeVehicle = editing || sent.current.pending;
    return (
      <FlowScreen
        title={title}
        facts={V.done}
        header={bar(100)}
        onClose={() => router.replace(sent.current.pending ? `/vehicule/${saved.id}` : "/(tabs)/garage")}
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
                onPress={() => router.replace(PREFERENCES_ROUTE as never)}
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
  // Maquettes 1.1 et 1.5 : « Continuer » grisé tant qu'il n'y a pas de photo, ou que le choix n'est pas fait.
  const blocked = Boolean(issue) && (step === STEP.photos || step === STEP.identity);
  const last = step === STEP_COUNT - 1;
  return (
    <FlowScreen
      title={title}
      facts={V.stepOf(step + 1, STEP_COUNT, V.steps[step] ?? "")}
      onClose={close}
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
          {blocked && step === STEP.photos ? (
            <Text variant="caption" color={t.color.inkMuted} style={styles.why} testID="vehicle-step-why">
              {issue}
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
        <StepSpecs
          draft={draft}
          patch={patch}
          generation={generation}
          engines={realGeneration ? (engines.data ?? []) : []}
          onPreparation={onPreparation}
        />
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

const opKey = (op: ReturnType<typeof photoPlan>[number]) =>
  op.kind === "remove" ? `remove:${op.photoId}` : `${op.kind}:${op.key}`;

const styles = StyleSheet.create({
  footer: { flexDirection: "row", gap: space2, alignItems: "center" },
  grow: { flex: 1 },
  why: { textAlign: "center" },
  track: { height: 6, borderRadius: 3, overflow: "hidden", marginRight: 48, marginTop: -4 },
  fill: { height: "100%", borderRadius: 3 },
});
