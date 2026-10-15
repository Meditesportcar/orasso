// Ajouter un véhicule : type, marque / modèle / génération du référentiel (avec « Autre »), plaque, catégories et
// photos. La plaque n'est jamais visible des autres : seuls l'organisateur d'un événement où tu candidates la voit.
import { OTHER_LABEL, vehicleTypeLabels, vehicleTypes, type VehicleType } from "@orasso/shared";
import {
  Button,
  CheckboxField,
  Chip,
  ChipRow,
  Photo,
  Plate,
  SelectField,
  type SelectOption,
  Text,
  TextField,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/endpoints";
import { errorMessage } from "@/lib/http";
import { MAX_PHOTOS, type PickedPhoto, photoForm, pickPhotos } from "@/lib/photos";
import { useApi } from "@/lib/useApi";
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
  const [type, setType] = useState<VehicleType>("car");
  const [makeId, setMakeId] = useState<string | undefined>();
  const [modelId, setModelId] = useState<string | undefined>();
  const [generationId, setGenerationId] = useState<string | undefined>();
  const [year, setYear] = useState("");
  const [power, setPower] = useState("");
  const [plate, setPlate] = useState("");
  const [unregistered, setUnregistered] = useState(false);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Si l'envoi des photos échoue après la création, on reprend sans recréer le véhicule.
  const [created, setCreated] = useState<{ id: string; uploaded: number } | null>(null);

  const makes = useApi(() => api.makes(), [], { cacheKey: "ref.makes" });
  const models = useApi(() => api.models(makeId ?? ""), [makeId], { enabled: Boolean(makeId) });
  const generations = useApi(() => api.generations(modelId ?? ""), [modelId], { enabled: Boolean(modelId) });
  const categories = useApi(() => api.categories(), [], { cacheKey: "ref.categories" });

  const modelRows = useMemo(
    () => (models.data ?? []).filter((m) => m.isOther || m.vehicleType === type),
    [models.data, type],
  );

  // Changer de marque (ou de type) invalide le modèle et la génération choisis.
  useEffect(() => {
    setModelId(undefined);
    setGenerationId(undefined);
  }, [makeId, type]);
  useEffect(() => setGenerationId(undefined), [modelId]);

  const plateMissing = !unregistered && plate.trim().length === 0;
  const ready = Boolean(makeId && modelId) && !plateMissing;

  async function addPhotos() {
    try {
      const picked = await pickPhotos(MAX_PHOTOS - photos.length);
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
        const vehicle = await api.createVehicle({
          vehicleType: type,
          makeId: makeId as string,
          modelId: modelId as string,
          generationId: generationId ?? null,
          year: Number.isFinite(yearNumber) ? yearNumber : null,
          powerHp: Number.isFinite(powerNumber) ? powerNumber : null,
          plate: unregistered ? null : plate.trim(),
          unregistered,
          status: "active",
          categoryIds,
        } as Parameters<typeof api.createVehicle>[0]);
        target = { id: vehicle.id, uploaded: 0 };
        setCreated(target);
      }
      for (let i = target.uploaded; i < photos.length; i++) {
        setProgress(`Envoi de la photo ${i + 1} sur ${photos.length}…`);
        await api.uploadVehiclePhoto(target.id, await photoForm(photos[i] as PickedPhoto, i));
        target = { ...target, uploaded: i + 1 };
        setCreated(target);
      }
      if (router.canGoBack()) router.back();
      else router.replace("/garage");
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
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/garage"))}
      footer={
        <>
          {error ? (
            <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button variant="primary" icon="check" loading={busy} disabled={!ready} onPress={() => void submit()} fullWidth>
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
          <Chip key={v} selected={type === v} onPress={() => setType(v)}>
            {vehicleTypeLabels[v]}
          </Chip>
        ))}
      </ChipRow>

      <Plate style={styles.plate}>
        <SelectField
          label="Marque"
          options={options(makes.data)}
          value={makeId}
          onValueChange={setMakeId}
          placeholder="Choisir la marque"
        />
        <SelectField
          label="Modèle"
          options={options(modelRows)}
          value={modelId}
          onValueChange={setModelId}
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
      </Plate>

      <Plate style={styles.plate}>
        <TextField
          label="Plaque"
          value={plate}
          onChangeText={setPlate}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!unregistered}
          placeholder="AB-123-CD"
          help="Visible par l'organisateur seulement, jamais par les autres inscrits."
        />
        <CheckboxField label="Véhicule non immatriculé" checked={unregistered} onChange={setUnregistered} />
      </Plate>

      {categories.data && categories.data.length > 0 ? (
        <>
          <Text variant="label" color={t.color.inkMuted}>
            Catégories
          </Text>
          <ChipRow>
            {categories.data.map((c) => (
              <Chip
                key={c.id}
                selected={categoryIds.includes(c.id)}
                onPress={() =>
                  setCategoryIds((ids) => (ids.includes(c.id) ? ids.filter((x) => x !== c.id) : [...ids, c.id].slice(0, 10)))
                }
              >
                {c.label}
              </Chip>
            ))}
          </ChipRow>
        </>
      ) : null}

      <Text variant="label" color={t.color.inkMuted}>
        Photos · {photos.length} / {MAX_PHOTOS}
      </Text>
      <Text variant="body" color={t.color.inkMuted}>
        Évite de montrer la plaque : tes photos sont visibles de tous les inscrits. La première est la photo de ta carte.
      </Text>
      {photos.length > 0 ? (
        <View style={styles.photos}>
          {photos.map((p, i) => (
            <Pressable
              key={p.uri}
              accessibilityRole="button"
              accessibilityLabel={`Retirer la photo ${i + 1}`}
              onPress={() => !busy && setPhotos((all) => all.filter((x) => x.uri !== p.uri))}
            >
              <Photo source={{ uri: p.uri }} style={styles.photo} />
            </Pressable>
          ))}
        </View>
      ) : null}
      {photos.length < MAX_PHOTOS ? (
        <Button
          variant="secondary"
          icon="add"
          disabled={busy || created !== null}
          onPress={() => void addPhotos()}
          fullWidth
        >
          Ajouter des photos
        </Button>
      ) : null}
      {progress ? (
        <Text variant="meta" color={t.color.inkMuted}>
          {progress}
        </Text>
      ) : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  plate: { gap: space3, padding: space3 },
  two: { flexDirection: "row", gap: space2 },
  half: { flex: 1 },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  photo: { width: 92, height: 70, borderRadius: 8 },
});
