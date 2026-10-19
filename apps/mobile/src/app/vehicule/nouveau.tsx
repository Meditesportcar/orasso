// Ajouter un véhicule : type, marque / modèle / génération du référentiel (avec « Autre »), plaque, catégories et
// photos. La plaque n'est jamais visible des autres : seuls l'organisateur d'un événement où tu candidates la voit.

import {
  Button,
  CheckboxField,
  Chip,
  ChipRow,
  Plate,
  SelectField,
  type SelectOption,
  Text,
  TextField,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import {
  archiveStatusChoices,
  OTHER_LABEL,
  photoLabels,
  type VehicleStatus,
  type VehicleType,
  vehicleTypeLabels,
  vehicleTypes,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { CROP_VEHICLE, MAX_PHOTOS, type PickedPhoto, photoForm, pickPhotos } from "@/lib/photos";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { PhotoGrid, UploadProgress, type UploadState, waitUploadParked } from "@/ui/PhotoGrid";
import { FlowScreen } from "@/ui/Screens";

const { space2, space3 } = tokens.spacing;

/** « Autre » toujours en dernier, le reste par ordre alphabétique. */
function options<T extends { id: string; name: string; isOther: boolean }>(rows: T[] | null): SelectOption[] {
  return [...(rows ?? [])]
    .sort((a, b) => Number(a.isOther) - Number(b.isOther) || a.name.localeCompare(b.name, "fr"))
    .map((r) => ({ value: r.id, label: r.isOther ? OTHER_LABEL : r.name }));
}

export default function NouveauVehicule() {
  const { t } = useTheme();
  const router = useRouter();
  const { refreshMe } = useSession();
  const [type, setType] = useState<VehicleType>("car");
  const [makeId, setMakeId] = useState<string | undefined>();
  const [modelId, setModelId] = useState<string | undefined>();
  const [generationId, setGenerationId] = useState<string | undefined>();
  const [year, setYear] = useState("");
  const [power, setPower] = useState("");
  const [weight, setWeight] = useState("");
  const [status, setStatus] = useState<VehicleStatus>("active");
  const [statusNote, setStatusNote] = useState("");
  const [plate, setPlate] = useState("");
  const [unregistered, setUnregistered] = useState(false);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UploadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Si l'envoi des photos échoue après la création, on reprend sans recréer le véhicule.
  const [created, setCreated] = useState<{ id: string; uploaded: number; pending: boolean } | null>(null);

  const makes = useApi(() => api.makes(), [], { cacheKey: "ref.makes" });
  const models = useApi(() => api.models(makeId ?? ""), [makeId], { enabled: Boolean(makeId) });
  const generations = useApi(() => api.generations(modelId ?? ""), [modelId], { enabled: Boolean(modelId) });
  // Catégories filtrées par marque, type et année (lot 31) : celles qui ne conviennent pas sont grisées avec la raison.
  const yearValue = /^\d{4}$/.test(year) ? Number.parseInt(year, 10) : undefined;
  const categories = useApi(
    () => api.categories({ makeId, vehicleType: type, year: yearValue }),
    [makeId, type, yearValue],
  );
  const active = status === "active";
  // Une catégorie choisie qui ne convient plus (marque, type ou année changés) est décochée.
  useEffect(() => {
    const rows = categories.data;
    if (!rows) return;
    setCategoryIds((ids) => {
      const kept = ids.filter((id) => rows.find((c) => c.id === id)?.eligible);
      return kept.length === ids.length ? ids : kept;
    });
  }, [categories.data]);

  const modelRows = useMemo(
    () => (models.data ?? []).filter((m) => m.isOther || m.vehicleType === type),
    [models.data, type],
  );

  // Changer de type ou de marque invalide le modèle et la génération choisis ; changer de modèle, la génération.
  const pickType = (next: VehicleType) => {
    setType(next);
    setModelId(undefined);
    setGenerationId(undefined);
  };
  const pickMake = (next: string) => {
    setMakeId(next);
    setModelId(undefined);
    setGenerationId(undefined);
  };
  const pickModel = (next: string) => {
    setModelId(next);
    setGenerationId(undefined);
  };

  const plateMissing = active && !unregistered && plate.trim().length === 0;
  const ready = Boolean(makeId && modelId) && !plateMissing;

  async function addPhotos() {
    try {
      const picked = await pickPhotos(MAX_PHOTOS - photos.length, CROP_VEHICLE);
      setPhotos((all) => [...all, ...picked].slice(0, MAX_PHOTOS));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      let target = created;
      if (!target) {
        const yearNumber = Number.parseInt(year, 10);
        const powerNumber = Number.parseInt(power, 10);
        const weightNumber = Number.parseInt(weight, 10);
        const vehicle = await api.createVehicle({
          vehicleType: type,
          makeId: makeId as string,
          modelId: modelId as string,
          generationId: generationId ?? null,
          year: Number.isFinite(yearNumber) ? yearNumber : null,
          powerHp: Number.isFinite(powerNumber) ? powerNumber : null,
          weightKg: Number.isFinite(weightNumber) ? weightNumber : null,
          plate: unregistered || !plate.trim() ? null : plate.trim(),
          unregistered,
          status,
          statusNote: active ? null : statusNote.trim() || null,
          categoryIds,
        } as Parameters<typeof api.createVehicle>[0]);
        target = { id: vehicle.id, uploaded: 0, pending: Boolean(vehicle.plateTransfer) };
        setCreated(target);
      }
      for (let i = target.uploaded; i < photos.length; i++) {
        setProgress({ current: i + 1, total: photos.length });
        await api.uploadVehiclePhoto(target.id, await photoForm(photos[i] as PickedPhoto, i));
        target = { ...target, uploaded: i + 1 };
        setCreated(target);
      }
      // Lot 39 : l'anneau se ferme et la voiture se gare dans le O avant de quitter l'écran.
      if (photos.length > 0) {
        setProgress({ current: photos.length, total: photos.length, done: true });
        await waitUploadParked();
      }
      // Lot 40 : le premier véhicule actif fait passer de visiteur à exposant ; `GET /me` relu, la barre change.
      await refreshMe().catch(() => undefined);
      // Plaque d'un autre membre : le véhicule existe en attente de transfert ; sa page l'explique.
      if (target.pending) router.replace(`/vehicule/${target.id}`);
      else if (router.canGoBack()) router.back();
      else router.replace("/(tabs)/garage");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <FlowScreen
      title="Ajouter un véhicule"
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/garage"))}
      footer={
        <>
          {error ? (
            <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button
            variant="primary"
            icon="check"
            loading={busy}
            disabled={!ready}
            onPress={() => void submit()}
            fullWidth
          >
            {created ? "Terminer l'envoi des photos" : "Ajouter à mon garage"}
          </Button>
        </>
      }
    >
      <Text variant="posterM" color={t.color.ink}>
        Quel véhicule ?
      </Text>
      <ChipRow>
        {vehicleTypes.map((v) => (
          <Chip key={v} selected={type === v} onPress={() => pickType(v)}>
            {vehicleTypeLabels[v]}
          </Chip>
        ))}
      </ChipRow>

      <Plate style={styles.plate}>
        <SelectField
          label="Marque"
          options={options(makes.data)}
          value={makeId}
          onValueChange={pickMake}
          placeholder="Choisir la marque"
        />
        <SelectField
          label="Modèle"
          options={options(modelRows)}
          value={modelId}
          onValueChange={pickModel}
          placeholder={makeId ? "Choisir le modèle" : "Choisis d'abord la marque"}
        />
        <SelectField
          label="Génération (facultatif)"
          options={options(generations.data)}
          value={generationId}
          onValueChange={setGenerationId}
          placeholder={modelId ? "Choisir la génération" : "Choisis d'abord le modèle"}
        />
        <View style={styles.two}>
          <TextField
            label="Année"
            value={year}
            onChangeText={setYear}
            keyboardType="number-pad"
            maxLength={4}
            style={styles.half}
          />
          <TextField
            label="Puissance (ch)"
            value={power}
            onChangeText={setPower}
            keyboardType="number-pad"
            maxLength={4}
            style={styles.half}
          />
        </View>
        <TextField
          label="Poids en kg (facultatif)"
          value={weight}
          onChangeText={setWeight}
          keyboardType="number-pad"
          maxLength={5}
        />
      </Plate>

      <Muted variant="label">Statut</Muted>
      <ChipRow>
        <Chip selected={active} onPress={() => setStatus("active")}>
          Dans mon garage
        </Chip>
        {archiveStatusChoices.map((c) => (
          <Chip key={c.status} selected={status === c.status} onPress={() => setStatus(c.status)}>
            {c.label}
          </Chip>
        ))}
      </ChipRow>
      {active ? null : (
        <TextField label="Motif (facultatif)" value={statusNote} onChangeText={setStatusNote} maxLength={300} />
      )}

      <Plate style={styles.plate}>
        <TextField
          label="Plaque"
          value={plate}
          onChangeText={setPlate}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!unregistered}
          placeholder="AB-123-CD"
          help={
            active
              ? "Visible par l'équipe organisatrice seulement, jamais par les autres inscrits. Déjà prise par un autre membre ? Il sera prévenu et pourra confirmer le transfert."
              : "Facultative pour un véhicule archivé. Jamais visible des autres inscrits."
          }
        />
        <CheckboxField label="Véhicule non immatriculé" checked={unregistered} onChange={setUnregistered} />
      </Plate>

      {categories.data && categories.data.length > 0 ? (
        <>
          <Muted variant="label">Catégories</Muted>
          {categories.data.map((c) => (
            <View key={c.id} style={[styles.category, !c.eligible && styles.categoryOff]}>
              <Chip
                selected={categoryIds.includes(c.id)}
                onPress={
                  c.eligible
                    ? () =>
                        setCategoryIds((ids) =>
                          ids.includes(c.id) ? ids.filter((x) => x !== c.id) : [...ids, c.id].slice(0, 10),
                        )
                    : undefined
                }
              >
                {c.label}
              </Chip>
              {c.reason ? <Muted variant="caption">{c.reason}</Muted> : null}
            </View>
          ))}
        </>
      ) : null}

      <Muted variant="label">
        Photos · {photos.length} / {MAX_PHOTOS}
      </Muted>
      <Muted variant="body">
        Évite de montrer la plaque : tes photos sont visibles de tous les inscrits. La première est la photo de ta
        carte. Il en faut au moins une pour candidater.
      </Muted>
      {/* Lot 36 : croix visible et confirmation pour retirer, couverture au choix, recadrage à l'ajout. */}
      {photos.length > 0 ? (
        <PhotoGrid
          photos={photos.map((p, i) => ({ key: p.uri, source: { uri: p.uri }, label: `Photo ${i + 1}` }))}
          onRemove={(i) => setPhotos((all) => all.filter((_, j) => j !== i))}
          onCover={(i) => setPhotos((all) => [...all.slice(i, i + 1), ...all.filter((_, j) => j !== i)])}
          disabled={busy || created !== null}
          tileStyle={styles.photo}
          testID="new-vehicle-photos"
        />
      ) : null}
      {photos.length < MAX_PHOTOS ? (
        <Button
          variant="secondary"
          icon="add"
          disabled={busy || created !== null}
          onPress={() => void addPhotos()}
          fullWidth
        >
          {photoLabels.addOne}
        </Button>
      ) : null}
      {progress ? <UploadProgress {...progress} /> : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  plate: { gap: space3, padding: space3 },
  two: { flexDirection: "row", gap: space2 },
  half: { flex: 1 },
  photo: { width: 92, height: 70, borderRadius: tokens.radius.radiusSm },
  category: { flexDirection: "row", alignItems: "center", gap: space2, flexWrap: "wrap" },
  categoryOff: { opacity: 0.55 },
});
