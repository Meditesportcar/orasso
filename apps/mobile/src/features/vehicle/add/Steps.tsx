// Les quatre premières étapes de l'ajout de véhicule (lot 51, prototype `s-vadd`) : marque › modèle › génération dans
// la liste Orasso (« Autre » sans saisie libre), fiche technique, catégories (origine déduite, styles grisés avec la
// raison), photos (une à huit, étoile = couverture, croix confirmée, pastille « Plaque floutée »).
import { Button, Chip, ChipRow, Icon, Photo, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  type CategoryOption,
  vehicleWizardLabels as L,
  photoLabels,
  type VehicleGeneration,
  type VehicleMake,
  type VehicleModel,
  vehicleTypeLabels,
  vehicleTypes,
} from "@orasso/shared";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ConfirmSheet } from "@/features/orga/ConfirmSheet";
import { mediaSource } from "@/lib/media";
import { Muted } from "@/ui/Muted";
import {
  type Draft,
  filterRows,
  generationYears,
  MAX_PHOTOS,
  originCategories,
  styleCategories,
  yearChoices,
} from "./model";
import { PhotoBadge } from "./PlateFrameEditor";
import { ChoiceRow, Grid, GridButton, StepHead, StepNote } from "./parts";

const { space1, space2 } = tokens.spacing;

type Patch = (change: Partial<Draft>) => void;

// --- 1. Marque, modèle, génération --------------------------------------------------------------------------------

export function StepIdentity({
  draft,
  patch,
  makes,
  models,
  generations,
}: {
  draft: Draft;
  patch: Patch;
  makes: VehicleMake[];
  models: VehicleModel[];
  generations: VehicleGeneration[];
}) {
  const [search, setSearch] = useState("");
  const make = makes.find((m) => m.id === draft.makeId);
  const model = models.find((m) => m.id === draft.modelId);
  const level: "make" | "model" | "generation" = !draft.makeId ? "make" : !draft.modelId ? "model" : "generation";
  const pickType = (vehicleType: Draft["vehicleType"]) =>
    patch({ vehicleType, modelId: undefined, generationId: undefined });

  const rows =
    level === "make"
      ? filterRows(makes, search).map((m) => ({
          id: m.id,
          title: m.isOther ? L.other : m.name,
          detail: m.isOther ? L.otherHint : null,
          other: m.isOther,
          pick: () => {
            patch({ makeId: m.id, modelId: undefined, generationId: undefined });
            setSearch("");
          },
          selected: false,
        }))
      : level === "model"
        ? filterRows(models, search).map((m) => ({
            id: m.id,
            title: m.isOther ? L.other : m.name,
            detail: m.isOther ? L.otherHint : null,
            other: m.isOther,
            pick: () => {
              patch({ modelId: m.id, generationId: undefined });
              setSearch("");
            },
            selected: false,
          }))
        : filterRows(generations, search, false).map((g) => ({
            id: g.id,
            title: g.isOther ? L.other : g.name,
            detail: g.isOther ? L.otherHint : generationYears(g),
            other: g.isOther,
            pick: () => patch({ generationId: g.id }),
            selected: draft.generationId === g.id,
          }));
  const onlyOther = rows.length > 0 && rows.every((r) => r.other) && search.trim().length > 0;

  return (
    <>
      <StepHead title={L.identityTitle[draft.vehicleType]} text={L.identityText} />
      <Grid>
        {vehicleTypes.map((v) => (
          <GridButton
            key={v}
            label={vehicleTypeLabels[v]}
            icon="vehicle"
            selected={draft.vehicleType === v}
            onPress={() => pickType(v)}
            testID={`vehicle-type-${v}`}
          />
        ))}
      </Grid>
      <TextField label={L.search} value={search} onChangeText={setSearch} autoCorrect={false} testID="vehicle-search" />
      {make ? (
        <ChipRow>
          <Chip
            variant="accent"
            selected
            onPress={() => patch({ makeId: undefined, modelId: undefined, generationId: undefined })}
            accessibilityLabel={`${L.make} : ${make.isOther ? L.other : make.name}, changer`}
          >
            {make.isOther ? L.other : make.name}
          </Chip>
          {model ? (
            <Chip
              variant="accent"
              selected
              onPress={() => patch({ modelId: undefined, generationId: undefined })}
              accessibilityLabel={`${L.model} : ${model.isOther ? L.other : model.name}, changer`}
            >
              {model.isOther ? L.other : model.name}
            </Chip>
          ) : null}
          <Muted variant="label">{level === "model" ? L.model : L.generation}</Muted>
        </ChipRow>
      ) : (
        <Muted variant="label">{L.make}</Muted>
      )}
      <View style={styles.list}>
        {rows.map((r) => (
          <ChoiceRow
            key={r.id}
            title={r.title}
            detail={r.detail}
            selected={r.selected}
            icon={r.other ? "search" : "vehicle"}
            onPress={r.pick}
            testID={r.other ? "ref-other" : "ref-row"}
          />
        ))}
      </View>
      {onlyOther ? <Muted variant="caption">{L.noMatch}</Muted> : null}
    </>
  );
}

// --- 2. Fiche technique -------------------------------------------------------------------------------------------

export function StepSpecs({
  draft,
  patch,
  generation,
}: {
  draft: Draft;
  patch: Patch;
  generation: VehicleGeneration | undefined;
}) {
  const years = yearChoices(generation && !generation.isOther ? generation : undefined, new Date().getFullYear());
  const [yearText, setYearText] = useState(draft.year ? String(draft.year) : "");
  return (
    <>
      <StepHead title={L.specsTitle} text={L.specsText} />
      <TextField
        label={L.engine}
        value={draft.engine}
        onChangeText={(engine) => patch({ engine })}
        placeholder={L.enginePlaceholder}
        maxLength={80}
        testID="vehicle-engine"
      />
      <View style={styles.two}>
        <TextField
          label={L.power}
          value={draft.powerHp}
          onChangeText={(powerHp) => patch({ powerHp })}
          keyboardType="number-pad"
          maxLength={4}
          style={styles.half}
          testID="vehicle-power"
        />
        <TextField
          label={L.weight}
          value={draft.weightKg}
          onChangeText={(weightKg) => patch({ weightKg })}
          keyboardType="number-pad"
          maxLength={5}
          style={styles.half}
          testID="vehicle-weight"
        />
      </View>
      <Muted variant="label">{L.year}</Muted>
      {years.length ? (
        <Grid columns={4}>
          {years.map((y) => (
            <GridButton
              key={y}
              label={String(y)}
              selected={draft.year === y}
              onPress={() => patch({ year: draft.year === y ? undefined : y })}
              testID={`vehicle-year-${y}`}
            />
          ))}
        </Grid>
      ) : (
        <TextField
          label={L.year}
          value={yearText}
          onChangeText={(text) => {
            setYearText(text);
            const n = Number.parseInt(text, 10);
            patch({ year: /^\d{4}$/.test(text) ? n : undefined });
          }}
          keyboardType="number-pad"
          maxLength={4}
          testID="vehicle-year"
        />
      )}
      <Muted variant="label">{L.color}</Muted>
      <Grid columns={4}>
        {L.colors.map((color) => (
          <GridButton
            key={color}
            label={color}
            selected={draft.color === color}
            onPress={() => patch({ color: draft.color === color ? undefined : color })}
            testID={`vehicle-color-${color}`}
          />
        ))}
      </Grid>
    </>
  );
}

// --- 3. Catégories --------------------------------------------------------------------------------------------------

export function StepCategories({
  draft,
  patch,
  categories,
  make,
  ageNote,
}: {
  draft: Draft;
  patch: Patch;
  categories: CategoryOption[];
  make: VehicleMake | undefined;
  ageNote: string | null;
}) {
  const { t } = useTheme();
  const origins = originCategories(categories, make?.isOther ? null : make?.country);
  const styles2 = styleCategories(categories);
  const toggle = (id: string) =>
    patch({
      categoryIds: draft.categoryIds.includes(id)
        ? draft.categoryIds.filter((x) => x !== id)
        : [...draft.categoryIds, id].slice(0, 10),
    });
  return (
    <>
      <StepHead title={L.categoriesTitle} text={L.categoriesText} />
      {origins.map((o) => (
        <View
          key={o.id}
          style={[styles.origin, { backgroundColor: t.color.surfaceRaised }]}
          accessibilityLabel={`${o.label}, ${L.deducedFrom(make?.name ?? "")}`}
          testID="vehicle-origin"
        >
          <View style={styles.originText}>
            <Text variant="bodyStrong" color={t.color.ink}>
              {o.label}
            </Text>
            <Muted variant="caption">{L.deducedFrom(make?.name ?? "")}</Muted>
          </View>
          <Icon name="check" size={20} color={t.color.accentText} />
        </View>
      ))}
      <Muted variant="label">{L.styles}</Muted>
      <Grid>
        {styles2.map((c) => (
          <GridButton
            key={c.id}
            label={c.label}
            selected={draft.categoryIds.includes(c.id)}
            disabled={!c.eligible}
            reason={c.eligible ? null : c.reason}
            onPress={() => toggle(c.id)}
            testID={c.eligible ? "vehicle-style" : "vehicle-style-off"}
          />
        ))}
      </Grid>
      {ageNote ? <StepNote icon="alert">{ageNote}</StepNote> : null}
    </>
  );
}

// --- 4. Photos ------------------------------------------------------------------------------------------------------

export function StepPhotos({
  draft,
  onAdd,
  onRemove,
  onCover,
  busy,
}: {
  draft: Draft;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onCover: (index: number) => void;
  busy: boolean;
}) {
  const { t } = useTheme();
  const [removing, setRemoving] = useState<number | null>(null);
  return (
    <>
      <StepHead title={L.photosTitle} text={L.photosText} />
      <StepNote icon="plate">{L.photosAutoNote}</StepNote>
      <View style={styles.photos} testID="new-vehicle-photos">
        {draft.photos.map((p, i) => (
          <View key={p.key} style={styles.tile}>
            <View style={[styles.tileInner, { backgroundColor: t.color.surfaceSunken }]}>
              <PhotoThumb uri={p.uri} remote={Boolean(p.remoteId)} />
              <View style={styles.tileTop}>
                {i === 0 ? <PhotoBadge accent>{L.cover}</PhotoBadge> : null}
                {p.rects.length || p.plateBlurred ? <PhotoBadge>{L.plateBlurred}</PhotoBadge> : null}
              </View>
              <View style={styles.tileActions}>
                {i === 0 ? null : (
                  <Button
                    variant="close"
                    icon="grade"
                    onPhoto
                    label={L.makeCover}
                    disabled={busy}
                    onPress={() => onCover(i)}
                    testID="photo-cover"
                  />
                )}
                <Button
                  variant="close"
                  onPhoto
                  label={photoLabels.remove}
                  disabled={busy}
                  onPress={() => setRemoving(i)}
                  testID="photo-remove"
                />
              </View>
            </View>
          </View>
        ))}
        {draft.photos.length < MAX_PHOTOS ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={photoLabels.addOne}
            disabled={busy}
            onPress={onAdd}
            testID="vehicle-photo-add"
            style={[styles.tile, styles.add, { borderColor: t.color.line }]}
          >
            <Muted variant="bodyStrong">{L.addPhoto}</Muted>
            <Muted variant="caption">{L.photoCount(draft.photos.length)}</Muted>
          </Pressable>
        ) : null}
      </View>
      <ConfirmSheet
        modal
        visible={removing !== null}
        title={photoLabels.removeTitle}
        body={photoLabels.removeBody}
        confirmLabel={photoLabels.removeConfirm}
        confirmIcon="close"
        danger
        onConfirm={() => {
          if (removing !== null) onRemove(removing);
          setRemoving(null);
        }}
        onClose={() => setRemoving(null)}
      />
    </>
  );
}

function PhotoThumb({ uri, remote }: { uri: string; remote: boolean }) {
  return <Photo source={remote ? mediaSource(uri) : { uri }} style={StyleSheet.absoluteFill} />;
}

const styles = StyleSheet.create({
  list: { gap: space2 },
  two: { flexDirection: "row", gap: space2 },
  half: { flex: 1 },
  origin: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    padding: space2 + space1,
    borderRadius: tokens.radius.radiusMd,
  },
  originText: { flex: 1, gap: 2 },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  tile: { width: "48%", aspectRatio: 4 / 5 },
  tileInner: { flex: 1, borderRadius: tokens.radius.radiusMd, overflow: "hidden" },
  tileTop: { position: "absolute", left: space2, top: space2, gap: space1, alignItems: "flex-start" },
  tileActions: {
    position: "absolute",
    right: space2,
    bottom: space2,
    flexDirection: "row",
    gap: space1,
  },
  add: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: tokens.radius.radiusMd,
    alignItems: "center",
    justifyContent: "center",
    gap: space1,
  },
});
