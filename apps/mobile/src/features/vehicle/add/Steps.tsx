// Étapes 3 à 5 de l'ajout de véhicule (lot 51 ; lot M1 d'après les maquettes 1.5 à 1.7 et l'artefact `s-vadd`) :
// marque › modèle › génération dans la liste Orasso (lot R4a : un modèle ou une marque absents se tapent), fiche technique (motorisation,
// puissance et poids en saisie libre — décision de Damien du 23/10, pas de catalogue —, années en rangée, nuancier,
// description, préparation), catégories (origine déduite sous cadenas, styles en pastilles, incompatibles cachés ou
// barrés avec une seule phrase d'explication).
import { Icon, type IconName, Text, TextField, textStyles, tokens, useTheme } from "@orasso/design-system/native";
import {
  type CategoryOption,
  cleanProposedName,
  vehicleWizardLabels as L,
  PROPOSED_NAME_MAX,
  vehicleAddLabels as V,
  VEHICLE_DESCRIPTION_MAX,
  VEHICLE_ENGINE_MAX,
  VEHICLE_VERSION_MAX,
  type VehicleGeneration,
  type VehicleMake,
  type VehicleModel,
  type VehiclePreparation,
  type VehicleReferenceHit,
  type VehicleType,
  vehiclePreparationLabels,
  vehiclePreparations,
  vehicleTypeLabels,
  vehicleTypes,
} from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { api } from "@/lib/api";
import { ApiRequestError } from "@/lib/http";
import { cacheScope } from "@/lib/kv";
import { createRequestGate } from "@/lib/requestGate";

import { ColorPicker } from "./ColorPicker";
import { typeIcon } from "./LiveCard";
import {
  type Draft,
  dimmedNote,
  filterRows,
  generationYears,
  originCategories,
  pickableOrigins,
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

/**
 * Lot R4a : la recherche « Marque ou modèle » passe par la route tolérante du lot R3c (« golf 4 », « e36 », « mx5 »),
 * une requête par pause de frappe. Seule la dernière requête compte (`requestGate` : identifiant de requête, compte) ;
 * la réponse porte sa saisie. `null` : pas encore de réponse ; `"busy"` : trop de demandes (429) ; `"offline"` : route
 * en panne. Dans les deux derniers cas, la liste se filtre sur l'appareil et une ligne le dit (jamais une liste vide
 * muette).
 */
function useReferenceSearch(text: string, type: VehicleType): VehicleReferenceHit[] | null | "offline" | "busy" {
  const q = text.trim();
  const gate = useRef(createRequestGate(cacheScope)).current;
  const [hits, setHits] = useState<{ q: string; rows: VehicleReferenceHit[] | "offline" | "busy" } | null>(null);
  useEffect(() => {
    if (!q) return;
    const key = `${type}|${q}`;
    const timer = setTimeout(() => {
      const ticket = gate.start();
      api
        .referenceSearch(q, type)
        .then((rows) => (ticket.current() ? setHits({ q: key, rows }) : undefined))
        .catch((error: unknown) => {
          if (!ticket.current()) return;
          const busy = error instanceof ApiRequestError && error.status === 429;
          setHits({ q: key, rows: busy ? "busy" : "offline" });
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      gate.invalidate();
    };
  }, [q, type, gate]);
  return q && hits?.q === `${type}|${q}` ? hits.rows : null;
}

type Row = {
  id: string;
  title: string;
  detail: string | null;
  other: boolean;
  pick: () => void;
  selected: boolean;
  testID?: string;
};

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
  const otherMake = makes.find((m) => m.isOther);
  const otherModel = models.find((m) => m.isOther);
  const typing = draft.typing;
  const level: "make" | "model" | "generation" | "typed" = typing
    ? "typed"
    : !draft.makeId
      ? "make"
      : !draft.modelId
        ? "model"
        : "generation";
  const reset = { modelId: undefined, generationId: undefined, typing: undefined } as const;
  const pickType = (vehicleType: Draft["vehicleType"]) =>
    patch({ vehicleType, ...reset, ...(draft.typing === "make" ? { makeId: undefined } : {}) });
  const q = search.trim();
  // Au niveau Modèle, la marque choisie fait partie de la recherche (« peugeot 207 ») : ses modèles passent en tête.
  const remote = useReferenceSearch(
    level === "make" ? q : level === "model" && q && make && !make.isOther ? `${make.name} ${q}` : "",
    draft.vehicleType,
  );

  // Modèle tapé chez une marque connue (« Ajouter « 207 » chez Peugeot », ou « Mon modèle n'est pas dans la liste »).
  const typeModel = (name: string) => {
    patch({ modelId: otherModel?.id, generationId: null, typing: "model", proposedModel: name, proposedMake: "" });
    setSearch("");
  };
  // Marque tapée : la marque « Autre » ; son modèle « Autre » se pose dès que ses modèles sont lus (VehicleWizard).
  const typeMake = (name: string) => {
    patch({
      makeId: otherMake?.id,
      modelId: undefined,
      generationId: null,
      typing: "make",
      proposedMake: name,
      proposedModel: "",
    });
    setSearch("");
  };
  const pickHit = (h: VehicleReferenceHit) => {
    patch({
      makeId: h.makeId,
      modelId: h.modelId ?? undefined,
      generationId: h.generationId ?? undefined,
      ...(h.vehicleType ? { vehicleType: h.vehicleType } : {}),
      typing: undefined,
    });
    setSearch("");
  };

  let rows: Row[] = [];
  let empty: string | null = null;
  let add: { label: string; onPress: () => void } | null = null;
  const searched = q.length > 0 && Array.isArray(remote);
  if (level === "make") {
    if (searched) {
      rows = remote.map((h) => ({
        id: `${h.kind}:${h.generationId ?? h.modelId ?? h.makeId}`,
        title: [h.makeName, h.modelName, h.generationName].filter(Boolean).join(" "),
        detail: h.kind === "generation" ? generationYears({ yearFrom: h.yearFrom, yearTo: h.yearTo }) : null,
        other: false,
        pick: () => pickHit(h),
        selected: false,
      }));
      if (!rows.length) {
        empty = L.noMakeMatch(q);
        add = { label: L.addTypedMake(q), onPress: () => typeMake(q) };
      }
    } else {
      rows = filterRows(makes, search).map((m) => ({
        id: m.id,
        title: m.isOther ? L.makeAbsent : m.name,
        detail: m.isOther ? L.absentHint : null,
        other: m.isOther,
        pick: () => {
          if (m.isOther) typeMake("");
          else {
            patch({ makeId: m.id, ...reset });
            setSearch("");
          }
        },
        selected: false,
      }));
    }
  } else if (level === "model") {
    const name = make?.isOther ? L.other : (make?.name ?? "");
    const mine = searched ? remote.filter((h) => h.makeId === draft.makeId && h.kind !== "make") : [];
    if (searched) {
      rows = mine.map((h) => ({
        id: `${h.kind}:${h.generationId ?? h.modelId}`,
        title: [h.modelName, h.generationName].filter(Boolean).join(" "),
        detail: h.kind === "generation" ? generationYears({ yearFrom: h.yearFrom, yearTo: h.yearTo }) : null,
        other: false,
        pick: () => pickHit(h),
        selected: false,
      }));
      if (!rows.length) {
        empty = L.noModelMatch(name, q);
        add = { label: L.addTyped(q, name), onPress: () => typeModel(q) };
      }
    } else {
      rows = filterRows(models, search).map((m) => ({
        id: m.id,
        title: m.isOther ? L.modelAbsent : m.name,
        detail: m.isOther ? L.absentHint : null,
        other: m.isOther,
        pick: () => {
          if (m.isOther) typeModel("");
          else {
            patch({ modelId: m.id, generationId: undefined });
            setSearch("");
          }
        },
        selected: false,
      }));
    }
  } else if (level === "generation") {
    rows = filterRows(generations, search, false).map((g) => ({
      id: g.id,
      // Lot R4a : « Autre » devient « Je ne sais pas, ou elle n'est pas dans la liste » (on continue sans rien taper).
      title: g.isOther ? L.generationUnknown : g.name,
      detail: g.isOther ? L.generationUnknownHint : generationYears(g),
      other: g.isOther,
      // Lot M1, tour 2 : motorisation, puissance et poids sont saisis par la personne ; changer de génération les garde.
      pick: () => patch({ generationId: g.id }),
      selected: draft.generationId === g.id,
    }));
  } else if (typing === "model") {
    rows = filterRows(
      models.filter((m) => !m.isOther),
      "",
    ).map((m) => ({
      id: m.id,
      title: m.name,
      detail: null,
      other: false,
      pick: () => patch({ modelId: m.id, generationId: undefined, typing: undefined }),
      selected: false,
    }));
  }

  const crumbs = [
    make && typing !== "make"
      ? {
          label: make.isOther ? L.other : make.name,
          a11y: `${L.make} : ${make.isOther ? L.other : make.name}, changer`,
          onPress: () => patch({ makeId: undefined, ...reset }),
        }
      : null,
    typing === "make"
      ? {
          label: cleanProposedName(draft.proposedMake) ?? "…",
          a11y: `${L.make} : ${draft.proposedMake ?? ""}, changer`,
          onPress: () => patch({ makeId: undefined, ...reset }),
        }
      : null,
    model && !typing
      ? {
          label: model.isOther ? L.other : model.name,
          a11y: `${L.model} : ${model.isOther ? L.other : model.name}, changer`,
          onPress: () => patch({ modelId: undefined, generationId: undefined }),
        }
      : null,
    typing
      ? {
          label: cleanProposedName(draft.proposedModel) ?? "…",
          a11y: `${L.model} : ${draft.proposedModel ?? ""}, changer`,
          onPress: () => patch(typing === "make" ? { makeId: undefined, ...reset } : reset),
        }
      : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);
  const next = typing ? L.generationOptional : level === "model" ? L.model : L.generation;

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
      {level !== "typed" ? (
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
      ) : null}
      {crumbs.length ? (
        <Crumb items={crumbs} next={next} />
      ) : (
        <Text variant="label" color={c.inkMuted}>
          {L.make}
        </Text>
      )}
      {typing ? (
        <TypedName
          typing={typing}
          make={draft.proposedMake ?? ""}
          model={draft.proposedModel ?? ""}
          onMake={(proposedMake) => patch({ proposedMake: proposedMake.slice(0, PROPOSED_NAME_MAX) })}
          onModel={(proposedModel) => patch({ proposedModel: proposedModel.slice(0, PROPOSED_NAME_MAX) })}
        />
      ) : null}
      {typing === "model" && rows.length ? (
        <Text variant="label" color={c.inkMuted}>
          {L.pickInList(make?.name ?? "")}
        </Text>
      ) : null}
      {empty ? (
        <Text variant="body" color={c.inkMuted} testID="vehicle-search-empty">
          {empty}
        </Text>
      ) : null}
      {add ? <AddTyped label={add.label} onPress={add.onPress} /> : null}
      <View style={styles.list}>
        {rows.map((r) => (
          <SelectRow
            key={r.id}
            title={r.title}
            detail={r.detail}
            selected={r.selected}
            other={r.other}
            icon={r.other ? (level === "generation" ? "help" : "edit") : typeIcon[draft.vehicleType]}
            onPress={r.pick}
            testID={r.other ? "ref-other" : "ref-row"}
          />
        ))}
      </View>
      {typing ? <StepNote icon="info">{L.generationSkipped}</StepNote> : null}
      {(remote === "offline" || remote === "busy") && level !== "typed" ? (
        <StepNote icon="info" testID="vehicle-search-error">
          {remote === "busy" ? L.searchBusy : L.searchOffline}
        </StepNote>
      ) : null}
    </>
  );
}

/** « Ajouter « 207 » chez Peugeot » (`.r4add`) : un toucher, et la fiche part avec ce nom. */
function AddTyped({ label, onPress }: { label: string; onPress: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID="vehicle-add-typed"
      style={[styles.add, { backgroundColor: c.surface, borderColor: c.accent }]}
    >
      <Icon name="add" size={22} color={c.accentText} />
      <View style={styles.grow}>
        <Text variant="bodyStrong" color={c.ink}>
          {label}
        </Text>
        <Text variant="caption" color={c.inkMuted}>
          {L.addTypedHint}
        </Text>
      </View>
      <Icon name="next" size={18} color={c.inkMuted} />
    </Pressable>
  );
}

/** Le nom tapé (`.r4other`) : « Mon modèle n'est pas dans la liste », le champ, la phrase validée. */
function TypedName({
  typing,
  make,
  model,
  onMake,
  onModel,
}: {
  typing: "model" | "make";
  make: string;
  model: string;
  onMake: (text: string) => void;
  onModel: (text: string) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={[styles.typed, { backgroundColor: c.ground, borderColor: c.accent }]} testID="vehicle-typed">
      <View style={styles.typedHead}>
        <Icon name="edit" size={22} color={c.accentText} />
        <View style={styles.grow}>
          <Text variant="bodyStrong" color={c.ink}>
            {typing === "make" ? L.makeAbsent : L.modelAbsent}
          </Text>
          <Text variant="caption" color={c.inkMuted}>
            {L.absentHint}
          </Text>
        </View>
        <View style={[styles.typedCheck, { backgroundColor: c.accent }]}>
          <Icon name="check" size={16} strokeWidth={3} color={c.accentInk} />
        </View>
      </View>
      {typing === "make" ? (
        <TextField
          label={L.makeNameField}
          value={make}
          onChangeText={onMake}
          maxLength={PROPOSED_NAME_MAX}
          autoCapitalize="words"
          autoFocus={!make}
          testID="vehicle-typed-make"
        />
      ) : null}
      <TextField
        label={L.modelNameField}
        value={model}
        onChangeText={onModel}
        maxLength={PROPOSED_NAME_MAX}
        autoCapitalize="characters"
        autoFocus={typing === "model" && !model}
        testID="vehicle-typed-model"
      />
      <View style={styles.say}>
        <Icon name="check" size={15} color={c.accentText} />
        <Text variant="caption" color={c.inkMuted} style={styles.grow}>
          {L.absentSay}
        </Text>
      </View>
    </View>
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
        {/* Lot R4e (Damien) : la version, après le modèle dans le nom (« Peugeot 207 CC »), pour tout modèle. */}
        <TextField
          label={V.version}
          value={draft.version}
          onChangeText={(version) => patch({ version: version.slice(0, VEHICLE_VERSION_MAX) })}
          help={V.versionHelp}
          maxLength={VEHICLE_VERSION_MAX}
          autoCapitalize="words"
          testID="vehicle-version"
        />
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
      {/* Lot R4a : marque tapée, l'origine ne se déduit pas : la personne la choisit. */}
      {draft.typing === "make" && pickableOrigins(categories).length ? (
        <>
          <FieldLabel>{L.originPick}</FieldLabel>
          <View style={styles.pills} testID="vehicle-origin-pick">
            {pickableOrigins(categories).map((o) => (
              <Pill
                key={o.id}
                label={o.label}
                icon="flag"
                selected={draft.categoryIds.includes(o.id)}
                off={false}
                hint={null}
                onPress={() => toggle(o.id)}
                testID="vehicle-origin-choice"
              />
            ))}
          </View>
        </>
      ) : null}
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
  clear: {
    width: 36,
    height: 36,
    borderRadius: tokens.radius.radiusChip,
    alignItems: "center",
    justifyContent: "center",
  },
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
    borderRadius: tokens.radius.radiusSm / 2,
    overflow: "hidden",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  disc: { width: 11, height: 11, borderRadius: tokens.radius.radiusPill },
  // Lot R4a (maquette R4.8) : « Ajouter « 207 » chez Peugeot » et le nom tapé.
  add: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    minHeight: 56,
    paddingVertical: space2 + 2,
    paddingHorizontal: space3 + 2,
    borderRadius: tokens.radius.radiusMd,
    borderWidth: 1.5,
  },
  typed: { gap: space3, padding: space3 + 2, borderRadius: tokens.radius.radiusMd, borderWidth: 2 },
  typedHead: { flexDirection: "row", alignItems: "center", gap: space3 },
  typedCheck: {
    width: 24,
    height: 24,
    borderRadius: tokens.radius.radiusPill,
    alignItems: "center",
    justifyContent: "center",
  },
  say: { flexDirection: "row", alignItems: "flex-start", gap: space2 },
});
