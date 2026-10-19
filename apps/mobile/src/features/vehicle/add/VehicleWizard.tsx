// Ajouter ou modifier un véhicule en cinq étapes (lot 51, prototype `s-vadd`, ARCHITECTURE-DA-V2 § 3.6) : la carte se
// construit en haut à chaque étape ; (1) type, marque › modèle › génération de la liste Orasso, (2) fiche technique,
// (3) catégories, (4) photos, (5) plaque floutée et numéro privé. Envoi : création (ou modification), puis les photos une
// à une avec leurs cadres de plaque (floutées par l'API, définitivement) ; la voiture avance autour du O et se gare à
// 100 % ; la carte entre au garage. Fin : « Découvrir les événements autour de moi ».
import { Button, Park, SendProgress, Text, tokens, useTheme } from "@orasso/design-system/native";
import { vehicleWizardLabels as L, type VehicleFull } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { ShareSheet } from "@/features/vehicle/ShareSheet";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { CROP_VEHICLE, photoForm, pickPhotos } from "@/lib/photos";
import { detectPlates } from "@/lib/plates/detect";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { waitUploadParked } from "@/ui/PhotoGrid";
import { FlowScreen } from "@/ui/Screens";
import { LiveCard } from "./LiveCard";
import {
  ageNote,
  applyMode,
  type BlurMode,
  createBody,
  type Draft,
  type DraftPhoto,
  draftFromVehicle,
  emptyDraft,
  keptCategories,
  liveCard,
  MAX_PHOTOS,
  modelsForType,
  photoPlan,
  STEP_COUNT,
  shortName,
  stepIssue,
  updateBody,
  withCover,
} from "./model";
import { StepPlate } from "./StepPlate";
import { StepCategories, StepIdentity, StepPhotos, StepSpecs } from "./Steps";

const { space2, space3 } = tokens.spacing;

type Phase = "steps" | "sending" | "done";

let photoSeq = 0;

export function VehicleWizard({ vehicle }: { vehicle?: VehicleFull }) {
  const { t } = useTheme();
  const router = useRouter();
  const { refreshMe } = useSession();
  const editing = Boolean(vehicle);
  const [draft, setDraft] = useState<Draft>(() => (vehicle ? draftFromVehicle(vehicle) : emptyDraft()));
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<Phase>("steps");
  const [progress, setProgress] = useState({ done: 0, total: 0, complete: false });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<VehicleFull | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  // Envoi interrompu (réseau) : on reprend sans recréer le véhicule ni renvoyer les photos déjà parties.
  const sent = useRef<{
    vehicleId: string | null;
    done: Set<string>;
    pending: boolean;
    /** Photo locale envoyée → identifiant de la photo en ligne (ordre final). */
    uploaded: Map<string, string>;
  }>({ vehicleId: vehicle?.id ?? null, done: new Set(), pending: false, uploaded: new Map() });

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
  const card = liveCard(draft, step, { make, model, generation, categories: categories.data ?? [] });

  // --- Photos et détection -------------------------------------------------------------------------------------------
  function updatePhoto(key: string, change: (p: DraftPhoto) => DraftPhoto) {
    setDraft((d) => ({ ...d, photos: d.photos.map((p) => (p.key === key ? change(p) : p)) }));
  }

  async function addPhotos() {
    setError(null);
    try {
      const picked = await pickPhotos(MAX_PHOTOS - draft.photos.length, CROP_VEHICLE);
      const added: DraftPhoto[] = picked.map((p) => ({
        key: `local-${photoSeq++}`,
        uri: p.uri,
        width: p.width,
        height: p.height,
        rects: [],
        detection: "pending",
      }));
      setDraft((d) => ({ ...d, photos: [...d.photos, ...added].slice(0, MAX_PHOTOS) }));
      // Repérage de la plaque sur l'appareil, photo par photo ; rien ne part au serveur.
      for (const p of added) {
        const found = await detectPlates(p.uri, p.width, p.height).catch(() => null);
        setDraft((d) => ({
          ...d,
          photos: d.photos.map((x) =>
            x.key === p.key
              ? {
                  ...x,
                  detected: found ?? [],
                  detection: found === null ? "unavailable" : found.length ? "found" : "none",
                  rects: d.blurMode === "auto" ? (found ?? []) : x.rects,
                }
              : x,
          ),
        }));
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function setMode(mode: BlurMode) {
    setDraft((d) => ({ ...d, blurMode: mode, photos: applyMode(d.photos, mode) }));
  }

  // --- Étapes --------------------------------------------------------------------------------------------------------
  function next() {
    const issue = stepIssue(step, draft);
    if (issue) {
      setError(issue);
      return;
    }
    setError(null);
    if (step < STEP_COUNT - 1) setStep(step + 1);
    else void send();
  }

  function previous() {
    setError(null);
    if (step === 0) close();
    else setStep(step - 1);
  }

  // --- Envoi ---------------------------------------------------------------------------------------------------------
  async function send() {
    setPhase("sending");
    setError(null);
    const s = sent.current;
    const ops = photoPlan(draft, vehicle?.photos ?? []).filter((op) => !s.done.has(opKey(op)));
    const total = ops.length;
    setProgress({ done: 0, total, complete: false });
    try {
      let current: VehicleFull | null = null;
      if (!s.vehicleId) {
        current = await api.createVehicle(createBody(draft));
        s.vehicleId = current.id;
        s.pending = Boolean(current.plateTransfer);
      } else if (vehicle && !s.done.has("patch")) {
        const body = updateBody(draft, vehicle);
        if (Object.keys(body).length) current = await api.updateVehicle(vehicle.id, body);
        s.done.add("patch");
      }
      const id = s.vehicleId as string;
      current ??= await api.vehicle(id);
      // Photos envoyées : leur identifiant, pour poser l'ordre final (couverture en tête).
      const uploaded = s.uploaded;
      let n = 0;
      for (const op of ops) {
        if (op.kind === "remove") {
          await api.deleteVehiclePhoto(id, op.photoId);
        } else if (op.kind === "upload") {
          const photo = draft.photos.find((p) => p.key === op.key);
          if (photo) {
            const form = await photoForm({ uri: photo.uri, width: photo.width, height: photo.height }, n);
            if (op.rects.length) form.append("plateRects", JSON.stringify(op.rects));
            const before = new Set(current.photos.map((p) => p.id));
            const after = await api.uploadVehiclePhoto(id, form);
            const added = after.photos.find((p) => !before.has(p.id));
            if (added) uploaded.set(op.key, added.id);
            current = after;
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
      setError(errorMessage(e));
    }
  }

  const sendingLabel =
    progress.total > 0 ? L.uploading(Math.min(progress.done + 1, progress.total), progress.total) : L.saving;

  // --- Rendu ---------------------------------------------------------------------------------------------------------
  if (phase === "done" && saved) {
    const name = shortName({ make, model }, draft.vehicleType);
    return (
      <FlowScreen
        title={editing ? L.editTitle : L.title}
        onClose={() => router.replace(sent.current.pending ? `/vehicule/${saved.id}` : "/(tabs)/garage")}
        footer={
          <>
            {editing || sent.current.pending ? (
              <Button
                variant="primary"
                icon="next"
                onPress={() => router.replace(`/vehicule/${saved.id}`)}
                fullWidth
                testID="vehicle-done-see"
              >
                {L.seeVehicle}
              </Button>
            ) : (
              <Button
                variant="primary"
                icon="explore"
                onPress={() => router.replace("/(tabs)/explorer")}
                fullWidth
                testID="vehicle-done-explore"
              >
                {L.explore}
              </Button>
            )}
            <Button variant="secondary" icon="share" onPress={() => setShareOpen(true)} fullWidth>
              {L.share}
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
        <Park>
          <LiveCard
            card={{
              ...liveCard(draft, 4, { make, model, generation, categories: categories.data ?? [] }),
              cover: saved.photos[0]?.url ?? null,
            }}
            remoteCover
          />
        </Park>
        <Text variant="posterM" color={t.color.ink} accessibilityRole="header" testID="vehicle-done-title">
          {editing ? L.doneTitleEdit : L.doneTitle(name)}
        </Text>
        <Muted variant="body">{L.doneText}</Muted>
      </FlowScreen>
    );
  }

  if (phase === "sending") {
    return (
      <FlowScreen
        title={editing ? L.editTitle : L.title}
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
        <Text variant="posterM" color={t.color.ink} accessibilityRole="header">
          {L.parkingTitle}
        </Text>
        <Muted variant="body" accessibilityLiveRegion="polite" testID="vehicle-sending">
          {sendingLabel}
        </Muted>
        <View style={styles.send}>
          <SendProgress
            size={200}
            progress={progress.complete ? 1 : progress.total ? progress.done / progress.total : 0.1}
          />
        </View>
      </FlowScreen>
    );
  }

  const issue = stepIssue(step, draft);
  return (
    <FlowScreen
      title={editing ? L.editTitle : L.title}
      facts={L.stepOf(step + 1, L.steps[step] ?? "")}
      counter={`${step + 1}/${STEP_COUNT}`}
      onClose={close}
      footer={
        <>
          {error ? (
            <Text variant="caption" color={t.color.winText} accessibilityRole="alert" testID="vehicle-step-error">
              {error}
            </Text>
          ) : null}
          <View style={styles.footer}>
            <Button variant="secondary" icon="back" onPress={previous} testID="vehicle-step-back">
              {step === 0 ? "Fermer" : "Retour"}
            </Button>
            <View style={styles.grow}>
              <Button
                variant="primary"
                icon={step === STEP_COUNT - 1 ? "check" : "next"}
                onPress={next}
                fullWidth
                testID="vehicle-step-next"
                accessibilityHint={issue ?? undefined}
              >
                {step === STEP_COUNT - 1 ? (editing ? L.save : L.send) : L.next}
              </Button>
            </View>
          </View>
        </>
      }
    >
      <LiveCard card={card} remoteCover={Boolean(draft.photos[0]?.remoteId)} />
      {step === 0 ? (
        <StepIdentity
          draft={draft}
          patch={patch}
          makes={makes.data ?? []}
          models={modelRows}
          generations={generations.data ?? []}
        />
      ) : null}
      {step === 1 ? <StepSpecs draft={draft} patch={patch} generation={generation} /> : null}
      {step === 2 ? (
        <StepCategories
          draft={draft}
          patch={patch}
          categories={categories.data ?? []}
          make={make}
          ageNote={ageNote(categories.data ?? [], draft.year)}
        />
      ) : null}
      {step === 3 ? (
        <StepPhotos
          draft={draft}
          busy={false}
          onAdd={() => void addPhotos()}
          onRemove={(i) => setDraft((d) => ({ ...d, photos: d.photos.filter((_, j) => j !== i) }))}
          onCover={(i) => setDraft((d) => ({ ...d, photos: withCover(d.photos, i) }))}
        />
      ) : null}
      {step === 4 ? (
        <StepPlate
          draft={draft}
          patch={patch}
          onMode={setMode}
          onRects={(i, rects) => {
            const key = draft.photos[i]?.key;
            if (key) updatePhoto(key, (p) => ({ ...p, rects }));
          }}
        />
      ) : null}
    </FlowScreen>
  );
}

const opKey = (op: ReturnType<typeof photoPlan>[number]) =>
  op.kind === "remove" ? `remove:${op.photoId}` : `${op.kind}:${op.key}`;

const styles = StyleSheet.create({
  footer: { flexDirection: "row", gap: space2, alignItems: "center" },
  grow: { flex: 1 },
  send: { alignItems: "center", paddingVertical: space3 },
});
