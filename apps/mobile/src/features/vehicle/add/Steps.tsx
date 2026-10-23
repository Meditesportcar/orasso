// Étapes 3 à 5 de l'ajout de véhicule (lot 51 ; lot M1 d'après les maquettes 1.5 à 1.7 et l'artefact `s-vadd`) :
// marque › modèle › génération dans la liste Orasso (« Autre » sans saisie libre), fiche technique (motorisation,
// puissance et poids en saisie libre — décision de Damien du 23/10, pas de catalogue —, années en rangée, nuancier,
// description, préparation), catégories (origine déduite sous cadenas, styles en pastilles, incompatibles cachés ou
// barrés avec une seule phrase d'explication).
import { Icon, type IconName, Text, TextField, textStyles, tokens, useTheme } from "@orasso/design-system/native";
import {
  type CategoryOption,
  vehicleWizardLabels as L,
  vehicleAddLabels as V,
  VEHICLE_DESCRIPTION_MAX,
  VEHICLE_ENGINE_MAX,
  type VehicleGeneration,
  type VehicleMake,
  type VehicleModel,
  type VehiclePreparation,
  vehiclePreparationLabels,
  vehiclePreparations,
  vehicleTypeLabels,
  vehicleTypes,
} from "@orasso/shared";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { ColorPicker } from "./ColorPicker";
import { typeIcon } from "./LiveCard";
import {
  type Draft,
  dimmedNote,
  filterRows,
  generationYears,
  originCategories,
  visibleStyles,
  yearChoices,
} from "./model";
import { Crumb, FieldLabel, Pill, SelectRow, StepHead, StepNote, TypeButton, YearChip } from "./parts";

const { space1, space2, space3 } = tokens.spacing;

type Patch = (change: Partial<Draft>) => void;

/** Pictogramme de chaque préparation (maquette 1.6). */
const PREP_ICONS = {
  engine: "power",
  exhaust: "weatherWind",
  intake: "spark",
  suspension: "layers",
  wheels: "rim",
  brakes: "shield",
  body: "vehicle",
  interior: "profile",
  wrap: "drop",
} as const satisfies Record<VehiclePreparation, IconName>;

/** Pictogramme des styles (artefact `s-vadd`, maquette 1.7) ; les autres catégories prennent l'étoile. */
const STYLE_ICONS: Record<string, IconName> = {
  jdm: "spark",
  sportive: "power",
  preparee: "wrench",
  "track-day": "flag",
  drift: "weatherWind",
  stance: "layers",
  origine: "drop",
  youngtimer: "wait",
  ancienne: "star",
  supercar: "trophy",
  moto: "moto",
  utilitaire: "truck",
  "4x4": "vehicle",
};

// --- 3. Marque, modèle, génération (1.5) ------------------------------------------------------------------------

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
  const { t } = useTheme();
  const c = t.color;
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
            // Lot M1, tour 2 : motorisation, puissance et poids sont saisis par la personne ; changer de génération
            // les garde.
            pick: () => patch({ generationId: g.id }),
            selected: draft.generationId === g.id,
          }));
  const onlyOther = rows.length > 0 && rows.every((r) => r.other) && search.trim().length > 0;
  const crumbs = [
    make
      ? {
          label: make.isOther ? L.other : make.name,
          a11y: `${L.make} : ${make.isOther ? L.other : make.name}, changer`,
          onPress: () => patch({ makeId: undefined, modelId: undefined, generationId: undefined }),
        }
      : null,
    model
      ? {
          label: model.isOther ? L.other : model.name,
          a11y: `${L.model} : ${model.isOther ? L.other : model.name}, changer`,
          onPress: () => patch({ modelId: undefined, generationId: undefined }),
        }
      : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <>
      <StepHead title={L.identityTitle[draft.vehicleType]} text={L.identityText} />
      <View style={styles.types} accessibilityRole="radiogroup">
        {vehicleTypes.map((v) => (
          <TypeButton
            key={v}
            label={vehicleTypeLabels[v]}
            icon={typeIcon[v]}
            selected={draft.vehicleType === v}
            onPress={() => pickType(v)}
            testID={`vehicle-type-${v}`}
          />
        ))}
      </View>
      <View style={[styles.search, { backgroundColor: c.surfaceField, borderColor: c.line }]}>
        <Icon name="search" size={20} color={c.inkMuted} />
        <TextInput
          accessibilityLabel={L.search}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          placeholder={L.search}
          placeholderTextColor={c.inkFaint}
          selectionColor={c.accent}
          style={[textStyles.body, styles.searchInput, { color: c.ink }]}
          testID="vehicle-search"
        />
        {search ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={V.clearSearch}
            onPress={() => setSearch("")}
            style={[styles.clear, { backgroundColor: c.surfaceRaised }]}
            testID="vehicle-search-clear"
          >
            <Icon name="close" size={18} color={c.ink} />
          </Pressable>
        ) : null}
      </View>
      {crumbs.length ? (
        <Crumb items={crumbs} next={level === "model" ? L.model : L.generation} />
      ) : (
        <Text variant="label" color={c.inkMuted}>
          {L.make}
        </Text>
      )}
      <View style={styles.list}>
        {rows.map((r) => (
          <SelectRow
            key={r.id}
            title={r.title}
            detail={r.detail}
            selected={r.selected}
            other={r.other}
            icon={r.other ? "help" : typeIcon[draft.vehicleType]}
            onPress={r.pick}
            testID={r.other ? "ref-other" : "ref-row"}
          />
        ))}
      </View>
      {onlyOther ? <StepNote icon="info">{L.noMatch}</StepNote> : null}
    </>
  );
}

// --- 4. Fiche technique (1.6) -----------------------------------------------------------------------------------

export function StepSpecs({
  draft,
  patch,
  generation,
  onPreparation,
}: {
  draft: Draft;
  patch: Patch;
  generation: VehicleGeneration | undefined;
  /** Une préparation vient d'être choisie (la catégorie « Préparée » se coche d'office). */
  onPreparation: (items: VehiclePreparation[]) => void;
}) {
  const years = yearChoices(generation && !generation.isOther ? generation : undefined, new Date().getFullYear());
  const [yearText, setYearText] = useState(draft.year ? String(draft.year) : "");
  const customColor = Boolean(draft.colorCustom);
  const toggle = (p: VehiclePreparation) => {
    const next = draft.preparation.includes(p) ? draft.preparation.filter((x) => x !== p) : [...draft.preparation, p];
    patch({ preparation: next });
    onPreparation(next);
  };
  return (
    <>
      <StepHead title={L.specsTitle} text={V.specsText} />
      {/* Décision de Damien du 23/10 : trois champs libres et facultatifs, bornes de `vehicleSpecsIssue`. */}
      <View style={styles.stack}>
        <TextField
          label={L.engine}
          value={draft.engine}
          onChangeText={(engine) => patch({ engine: engine.slice(0, VEHICLE_ENGINE_MAX) })}
          help={V.engineHelp}
          maxLength={VEHICLE_ENGINE_MAX}
          autoCapitalize="none"
          testID="vehicle-engine"
        />
        <View style={styles.two}>
          <TextField
            label={L.power}
            value={draft.powerHp}
            onChangeText={(powerHp) => patch({ powerHp: powerHp.replace(/\D/g, "") })}
            keyboardType="number-pad"
            maxLength={4}
            help={V.powerHelp}
            style={styles.grow}
            testID="vehicle-power"
          />
          <TextField
            label={L.weight}
            value={draft.weightKg}
            onChangeText={(weightKg) => patch({ weightKg: weightKg.replace(/\D/g, "") })}
            keyboardType="number-pad"
            maxLength={5}
            help={V.weightHelp}
            style={styles.grow}
            testID="vehicle-weight"
          />
        </View>
      </View>
      <FieldLabel>{V.year}</FieldLabel>
      {years.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.years}>
          {years.map((y) => (
            <YearChip
              key={y}
              year={y}
              selected={draft.year === y}
              onPress={() => patch({ year: draft.year === y ? undefined : y })}
            />
          ))}
        </ScrollView>
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
      <ColorPicker
        value={draft.color}
        custom={customColor}
        onChange={(color, custom) => patch({ color, colorCustom: custom })}
      />
      <View style={styles.stack}>
        <TextField
          label={V.description}
          value={draft.description}
          onChangeText={(description) => patch({ description: description.slice(0, VEHICLE_DESCRIPTION_MAX) })}
          placeholder={V.descriptionPlaceholder}
          multiline
          numberOfLines={4}
          maxLength={VEHICLE_DESCRIPTION_MAX}
          help={V.descriptionHint}
          testID="vehicle-description"
        />
      </View>
      <FieldLabel>{V.preparation}</FieldLabel>
      <View style={styles.pills}>
        {vehiclePreparations.map((p) => (
          <Pill
            key={p}
            label={vehiclePreparationLabels[p]}
            icon={PREP_ICONS[p]}
            selected={draft.preparation.includes(p)}
            onPress={() => toggle(p)}
            testID={`vehicle-prep-${p}`}
          />
        ))}
      </View>
    </>
  );
}

// --- 5. Catégories (1.7) ------------------------------------------------------------------------------------------

export function StepCategories({
  draft,
  patch,
  categories,
  make,
}: {
  draft: Draft;
  patch: Patch;
  categories: CategoryOption[];
  make: VehicleMake | undefined;
}) {
  const { t } = useTheme();
  const c = t.color;
  const origins = originCategories(categories, make?.isOther ? null : make?.country);
  const styles2 = visibleStyles(categories);
  const note = dimmedNote(categories, draft.year, draft.vehicleType);
  const prepared = categories.find((x) => x.slug === "preparee");
  const preparedNote = draft.preparation.length > 0 && prepared && draft.categoryIds.includes(prepared.id);
  const toggle = (id: string) =>
    patch({
      categoryIds: draft.categoryIds.includes(id)
        ? draft.categoryIds.filter((x) => x !== id)
        : [...draft.categoryIds, id].slice(0, 10),
    });
  return (
    <>
      <StepHead title={L.categoriesTitle} text={L.categoriesText} />
      {origins.map((o) => {
        const line = V.originLine(o.label, make?.country ?? null, make?.name ?? "");
        return (
          <View
            key={o.id}
            style={[styles.origin, { backgroundColor: c.surface }]}
            accessible
            accessibilityLabel={`${line.title}, ${line.detail}, ${V.originLocked}`}
            testID="vehicle-origin"
          >
            <Flag country={make?.country ?? null} />
            <View style={styles.grow}>
              <Text variant="bodyStrong" color={c.ink}>
                {line.title}
              </Text>
              <Text variant="caption" color={c.inkMuted}>
                {line.detail}
              </Text>
            </View>
            <Icon name="lock" size={16} color={c.inkMuted} />
          </View>
        );
      })}
      <FieldLabel>{L.styles}</FieldLabel>
      <View style={styles.pills}>
        {styles2.map((s) => (
          <Pill
            key={s.id}
            label={s.label}
            icon={STYLE_ICONS[s.slug] ?? "star"}
            selected={draft.categoryIds.includes(s.id)}
            off={!s.eligible}
            hint={s.eligible ? null : s.reason}
            onPress={() => toggle(s.id)}
            testID={s.eligible ? "vehicle-style" : "vehicle-style-off"}
          />
        ))}
      </View>
      {note || preparedNote ? (
        <StepNote icon="info" testID="vehicle-styles-note">
          {[note, preparedNote ? V.preparedChecked : null].filter(Boolean).join(" ")}
        </StepNote>
      ) : null}
    </>
  );
}

/**
 * Drapeau du pays de la marque (`.vo-flag`), dessiné en bandes : Japon (disque), France, Italie, Allemagne,
 * Royaume-Uni (croix simple), États-Unis (bandes) ; sinon un rectangle neutre.
 */
function Flag({ country }: { country: string | null }) {
  const { t } = useTheme();
  const c = t.color;
  const art = FLAGS[country ?? ""];
  return (
    <View style={[styles.flag, { backgroundColor: art?.ground ?? c.surfaceRaised, borderColor: c.line }]}>
      {art?.bands ? (
        <View style={[StyleSheet.absoluteFill, { flexDirection: art.vertical ? "column" : "row" }]}>
          {art.bands.map((b, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: bandes d'un drapeau, ordre fixe
            <View key={i} style={{ flex: 1, backgroundColor: b }} />
          ))}
        </View>
      ) : null}
      {art?.disc ? <View style={[styles.disc, { backgroundColor: art.disc }]} /> : null}
    </View>
  );
}

// Couleurs des drapeaux : des données (comme les teintes de carrosserie), pas des jetons d'interface.
const FLAGS: Record<string, { ground?: string; bands?: string[]; vertical?: boolean; disc?: string }> = {
  JP: { ground: "#f3ebdd", disc: "#c8322b" },
  FR: { bands: ["#2f5fb8", "#f3ebdd", "#c8322b"] },
  IT: { bands: ["#2e8b57", "#f3ebdd", "#c8322b"] },
  DE: { bands: ["#131417", "#c8322b", "#e9b824"], vertical: true },
  GB: { ground: "#2f5fb8", disc: undefined, bands: ["#2f5fb8", "#f3ebdd", "#2f5fb8"], vertical: true },
  US: { bands: ["#c8322b", "#f3ebdd", "#c8322b", "#f3ebdd", "#c8322b"], vertical: true },
  SE: { bands: ["#2f5fb8", "#e9b824", "#2f5fb8"], vertical: true },
  KR: { ground: "#f3ebdd", disc: "#2f5fb8" },
};

const styles = StyleSheet.create({
  types: { flexDirection: "row", gap: space2 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    minHeight: 48,
    borderRadius: tokens.radius.radiusMd,
    borderWidth: 1.5,
    paddingLeft: space3,
    paddingRight: space1 + 2,
  },
  searchInput: { flex: 1, minWidth: 0, height: 46, paddingVertical: 0, outlineStyle: "none" } as object,
  clear: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  grow: { flex: 1, minWidth: 0 },
  list: { gap: space2 },
  stack: { gap: space2 },
  two: { flexDirection: "row", gap: space2 },
  years: { gap: space1 + 2, paddingRight: space2 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  origin: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    paddingVertical: space3,
    paddingHorizontal: space3 + 2,
    borderRadius: tokens.radius.radiusMd,
  },
  flag: {
    width: 34,
    height: 24,
    borderRadius: 4,
    overflow: "hidden",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  disc: { width: 11, height: 11, borderRadius: 6 },
});
