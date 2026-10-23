// Ajout d'un véhicule sur le site (lot M1) : la même chose que l'appli, dans le même ordre et avec les mêmes mots, en une
// seule page de cinq sections (Photos, Plaque, Marque et modèle, Fiche technique, Catégories) puis « Envoyer ».
// Formulaire serveur (`Form` + `action`) : l'essentiel marche sans JavaScript ; les listes liées (modèles, motorisations,
// catégories), le recadrage carré et le nuancier demandent JavaScript. Les règles métier restent dans l'API.
import { Button, CheckboxField, Icon, SelectField, TextField } from "@orasso/design-system/web";
import {
  archiveStatusChoices,
  type CategoryOption,
  CERTIFICATION_MIN_PHOTOS,
  formatPreparation,
  vehicleWizardLabels as L,
  PREPARED_CATEGORY_SLUG,
  vehicleAddLabels as V,
  VEHICLE_DESCRIPTION_MAX,
  type VehicleCreate,
  type VehicleEngine,
  type VehicleFull,
  type VehicleGeneration,
  type VehicleMake,
  type VehicleModel,
  type VehiclePreparation,
  vehiclePreparationLabels,
  vehiclePreparations,
  vehicleTypeLabels,
  vehicleTypes,
} from "@orasso/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { data, Form, redirect, useNavigation } from "react-router";

import { ColorPicker } from "../components/ColorPicker";
import { TextAreaField } from "../components/Fields";
import { PhotoWithPlate, plateDecisionError } from "../components/PlateFrame";
import { SquareCrop } from "../components/SquareCrop";
import { apiFetch } from "../lib/api.client";
import { api, apiOrThrow, safeReturn } from "../lib/api.server";
import {
  dimmedNote,
  keptCategories,
  modelsForType,
  originCategories,
  preparedCategory,
  sortRows,
  visibleStyles,
  yearChoices,
} from "../lib/vehicle-add";
import type { Route } from "./+types/garage-nouveau";
import "../styles/garage.css";

export function meta() {
  return [{ title: "Ajouter un véhicule · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const retour = new URL(request.url).searchParams.get("retour");
  const makes = await apiOrThrow<VehicleMake[]>(request, "/vehicle-reference/makes");
  return { makes, retour: retour ? safeReturn(retour, "/app/garage") : null };
}

type Errors = Partial<
  Record<
    | "vehicleType"
    | "makeId"
    | "modelId"
    | "year"
    | "plate"
    | "photo"
    | "powerHp"
    | "weightKg"
    | "color"
    | "description"
    | "form",
    string
  >
>;

const preparationKeys = new Set<string>(vehiclePreparations);

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const retour = text("retour");
  const unregistered = form.get("unregistered") === "on";
  const status = (text("status") || "active") as VehicleCreate["status"];
  const active = status === "active";
  const yearText = text("year");
  const powerText = text("powerHp");
  const weightText = text("weightKg");
  const photo = form.get("photo");
  const errors: Errors = {};
  if (!text("makeId")) errors.makeId = "Choisis une marque.";
  if (!text("modelId")) errors.modelId = "Choisis un modèle.";
  if (active && !unregistered && !text("plate")) errors.plate = L.plateRequired;
  if (yearText && !/^\d{4}$/.test(yearText)) errors.year = "Année sur 4 chiffres.";
  if (powerText && !/^\d{1,4}$/.test(powerText)) errors.powerHp = "Puissance en chevaux, nombre entier.";
  if (weightText && !/^\d{2,5}$/.test(weightText)) errors.weightKg = "Poids en kilos, nombre entier.";
  if (text("color").length > 40) errors.color = "Teinte : 40 caractères au plus.";
  if (text("description").length > VEHICLE_DESCRIPTION_MAX) {
    errors.description = `Description : ${VEHICLE_DESCRIPTION_MAX} caractères au plus.`;
  }
  const hasPhoto = photo instanceof File && photo.size > 0;
  if (active && !hasPhoto) errors.photo = "Ajoute au moins une photo : elle est exigée pour candidater.";
  // Relecture du lot 51 : une photo part avec son cadre de plaque, ou « aucune plaque visible » coché.
  if (hasPhoto && plateDecisionError(form)) errors.photo = plateDecisionError(form) ?? undefined;
  if (Object.keys(errors).length) return data({ errors }, { status: 400 });

  const preparation = form
    .getAll("preparation")
    .map(String)
    .filter((p): p is VehiclePreparation => preparationKeys.has(p));
  const categoryIds = form.getAll("categoryIds").map(String);
  // Une préparation cochée coche « Préparée », si la catégorie convient à ce véhicule.
  if (preparation.length) {
    const query = new URLSearchParams({ vehicleType: text("vehicleType") || "car", makeId: text("makeId") });
    if (/^\d{4}$/.test(yearText)) query.set("year", yearText);
    const rows = await api<CategoryOption[]>(request, `/vehicle-reference/categories?${query}`);
    const prepared = rows.ok ? preparedCategory(rows.data, PREPARED_CATEGORY_SLUG) : null;
    if (prepared && !categoryIds.includes(prepared.id)) categoryIds.push(prepared.id);
  }

  const body: Partial<VehicleCreate> = {
    vehicleType: text("vehicleType") as VehicleCreate["vehicleType"],
    makeId: text("makeId"),
    modelId: text("modelId"),
    generationId: text("generationId") || null,
    year: yearText ? Number(yearText) : null,
    color: text("color") || null,
    engine: text("engine").slice(0, 80) || null,
    powerHp: powerText ? Number(powerText) : null,
    weightKg: weightText ? Number(weightText) : null,
    plate: unregistered ? null : text("plate") || null,
    unregistered,
    status,
    statusNote: active ? null : text("statusNote") || null,
    description: text("description") || null,
    preparation: formatPreparation(preparation),
    categoryIds,
  };
  const created = await api<VehicleFull>(request, "/me/vehicles", { method: "POST", json: body });
  if (!created.ok) {
    const field = created.error.code === "plate_taken" ? "plate" : "form";
    return data({ errors: { [field]: created.error.message } satisfies Errors }, { status: created.status });
  }
  if (!hasPhoto) return redirect(`/app/garage/${created.data.id}`);
  const upload = new FormData();
  upload.set("photo", photo as File);
  // Lot 51 : cadres de plaque posés à la main, floutés par l'API avant le stockage (définitif).
  if (text("plateRects")) upload.set("plateRects", text("plateRects"));
  const sent = await api(request, `/me/vehicles/${created.data.id}/photos`, { method: "POST", body: upload });
  if (!sent.ok) {
    // Le véhicule existe : on reste sur la fiche avec le message, la photo se rajoute depuis le garage.
    return redirect(`/app/garage?photo=refusee`);
  }
  // Plaque d'un autre membre : le véhicule existe, en attente de transfert (S36) ; on ouvre sa page pour l'expliquer.
  if (created.data.plateTransfer) return redirect(`/app/garage/${created.data.id}`);
  const back = safeReturn(retour, "/app/garage");
  if (retour) return redirect(`${back}${back.includes("?") ? "&" : "?"}vehicule=${created.data.id}`);
  return redirect("/app/garage");
}

// Textes propres au site (les autres viennent de `vehicleAddLabels` et `vehicleWizardLabels`).
const SITE = {
  photoOnlyOne: "Une photo à la création : tu ajoutes les autres depuis la fiche de ton véhicule.",
  photoHelp: "Une photo de ton véhicule, de face ou de trois quarts. Elle sera recadrée au carré.",
  formerNotCertified: "Un ancien véhicule ne peut pas être certifié.",
  formerStatus: "Il est…",
  statusNote: "Motif (facultatif)",
  type: "Type de véhicule",
  generation: "Génération",
  chooseGeneration: "Choisir la génération",
  styles: "Style · plusieurs choix",
} as const;

/** Les pastilles de photos conseillées (1, 2, 3). */
const CERT_DOTS = Array.from({ length: CERTIFICATION_MIN_PHOTOS }, (_, i) => i + 1);

const typeIcon = { car: "vehicle", moto: "moto", truck: "truck" } as const;

/** Drapeaux des marques (données, comme les teintes de carrosserie : pas des jetons d'interface). */
const FLAGS: Record<string, { ground?: string; bands?: string[]; vertical?: boolean; disc?: string }> = {
  JP: { ground: "#f3ebdd", disc: "#c8322b" },
  FR: { bands: ["#2f5fb8", "#f3ebdd", "#c8322b"] },
  IT: { bands: ["#2e8b57", "#f3ebdd", "#c8322b"] },
  DE: { bands: ["#131417", "#c8322b", "#e9b824"], vertical: true },
  GB: { bands: ["#2f5fb8", "#f3ebdd", "#2f5fb8"], vertical: true },
  US: { bands: ["#c8322b", "#f3ebdd", "#c8322b", "#f3ebdd", "#c8322b"], vertical: true },
  SE: { bands: ["#2f5fb8", "#e9b824", "#2f5fb8"], vertical: true },
  KR: { ground: "#f3ebdd", disc: "#2f5fb8" },
};

function Flag({ country }: { country: string | null }) {
  const art = FLAGS[country ?? ""];
  const stops = art?.bands
    ? art.bands.map((b, i, all) => `${b} ${(i / all.length) * 100}% ${((i + 1) / all.length) * 100}%`).join(", ")
    : null;
  const background = stops ? `linear-gradient(${art?.vertical ? "to bottom" : "to right"}, ${stops})` : art?.ground;
  return (
    <span className="g-flag" style={background ? { background } : undefined} aria-hidden="true" data-paint>
      {art?.disc ? <span className="g-flag__disc" style={{ background: art.disc }} /> : null}
    </span>
  );
}

export default function GarageNouveau({ loaderData, actionData }: Route.ComponentProps) {
  const { makes, retour } = loaderData;
  const errors: Errors = actionData?.errors ?? {};
  const busy = useNavigation().state !== "idle";
  const [type, setType] = useState<string>("car");
  const [makeId, setMakeId] = useState("");
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [generations, setGenerations] = useState<VehicleGeneration[]>([]);
  const [generationId, setGenerationId] = useState("");
  const [engines, setEngines] = useState<VehicleEngine[]>([]);
  // Motorisation du catalogue choisie ; `null` : « Autre motorisation » ; `undefined` : rien de choisi.
  const [engineId, setEngineId] = useState<string | null | undefined>(undefined);
  const [engine, setEngine] = useState("");
  const [powerHp, setPowerHp] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [year, setYear] = useState("");
  const [color, setColor] = useState("");
  const [colorCustom, setColorCustom] = useState(false);
  const [description, setDescription] = useState("");
  const [preparation, setPreparation] = useState<string[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [unregistered, setUnregistered] = useState(false);
  const [former, setFormer] = useState(false);
  const [status, setStatus] = useState<string>(archiveStatusChoices[0]?.status ?? "keepsake");
  const [hasPhoto, setHasPhoto] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const cropDone = useRef<((file: File | null) => void) | null>(null);
  const active = !former;

  // Recadrage carré : la photo choisie attend la réponse de la boîte de recadrage avant de partir dans le champ.
  const prepare = useCallback(
    (file: File) =>
      new Promise<File | null>((resolve) => {
        cropDone.current = resolve;
        setCropFile(file);
      }),
    [],
  );
  const finishCrop = (file: File | null) => {
    setHasPhoto(file !== null);
    cropDone.current?.(file);
    cropDone.current = null;
    setCropFile(null);
  };

  useEffect(() => {
    setModelId("");
    setModels([]);
    if (!makeId) return;
    apiFetch<VehicleModel[]>(`/vehicle-reference/makes/${makeId}/models`).then((res) => {
      if (res.ok) setModels(res.data);
    });
  }, [makeId]);

  useEffect(() => {
    setGenerations([]);
    setGenerationId("");
    if (!modelId) return;
    apiFetch<VehicleGeneration[]>(`/vehicle-reference/models/${modelId}/generations`).then((res) => {
      if (res.ok) setGenerations(res.data);
    });
  }, [modelId]);

  // Motorisations du catalogue de la génération ; sans catalogue : saisie directe.
  useEffect(() => {
    setEngines([]);
    setEngineId(undefined);
    if (!generationId) return;
    let stale = false;
    apiFetch<VehicleEngine[]>(`/vehicle-reference/generations/${generationId}/engines`).then((res) => {
      if (!stale && res.ok) setEngines(res.data);
    });
    return () => {
      stale = true;
    };
  }, [generationId]);

  // Catégories filtrées par marque, type et année.
  useEffect(() => {
    const query = new URLSearchParams({ vehicleType: type });
    if (makeId) query.set("makeId", makeId);
    if (/^\d{4}$/.test(year)) query.set("year", year);
    let stale = false;
    apiFetch<CategoryOption[]>(`/vehicle-reference/categories?${query}`).then((res) => {
      if (!stale && res.ok) setCategories(res.data);
    });
    return () => {
      stale = true;
    };
  }, [type, makeId, year]);

  const make = makes.find((m) => m.id === makeId);
  const sortedMakes = useMemo(() => sortRows(makes), [makes]);
  const visibleModels = useMemo(
    () => sortRows(modelsForType(models, type as "car" | "moto" | "truck")),
    [models, type],
  );
  const generation = generations.find((g) => g.id === generationId);
  const years = yearChoices(generation, new Date().getFullYear());
  const catalog = engines.length > 0;
  const otherEngine = !catalog || engineId === null;
  const origins = originCategories(categories, make);
  const styles = visibleStyles(categories);
  const prepared = preparedCategory(categories, PREPARED_CATEGORY_SLUG);
  const numericYear = /^\d{4}$/.test(year) ? Number(year) : undefined;
  const note = dimmedNote(categories, numericYear, type as "car" | "moto" | "truck");
  const preparedNote = preparation.length > 0 && prepared && categoryIds.includes(prepared.id);

  // Les styles choisis qui ne conviennent plus (autre marque, autre année) sont retirés.
  useEffect(() => {
    setCategoryIds((ids) => {
      const originIds = originCategories(categories, make).map((c) => c.id);
      const next = keptCategories(ids, categories, make).filter((id) => !originIds.includes(id));
      return next.length === ids.length && next.every((id, i) => id === ids[i]) ? ids : next;
    });
  }, [categories, make]);

  const pickEngine = (e: VehicleEngine) => {
    setEngineId(e.id);
    setEngine(e.name);
    setPowerHp(e.powerHp ? String(e.powerHp) : "");
    setWeightKg(e.weightKg ? String(e.weightKg) : "");
  };
  const togglePreparation = (key: string) => {
    const next = preparation.includes(key) ? preparation.filter((p) => p !== key) : [...preparation, key];
    setPreparation(next);
    // Une préparation choisie coche « Préparée » ; la retirer tout à fait ne décoche rien (le choix reste à la personne).
    if (next.length && prepared) setCategoryIds((ids) => (ids.includes(prepared.id) ? ids : [...ids, prepared.id]));
  };
  const toggleStyle = (id: string) =>
    setCategoryIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(0, 10)));

  const certNoun = hasPhoto ? V.certSome(1) : V.certNone;

  return (
    <div className="s-narrow s-stack">
      <h1 className="s-title">{L.title}</h1>
      <Form method="post" encType="multipart/form-data" className="s-form g-add" data-testid="vehicle-add-form">
        {retour && <input type="hidden" name="retour" value={retour} />}

        {/* 1 · Photos */}
        <section className="s-stack g-section" data-testid="add-photos">
          <h2 className="s-h2">{`1 · ${V.steps[0]}`}</h2>
          <p className="o-t-body s-muted">{V.photosText}</p>
          <PhotoWithPlate
            label="Photo"
            help={SITE.photoHelp}
            error={errors.photo}
            required={active}
            testId="new-plate-frame"
            prepare={prepare}
          />
          <div className="g-cert" data-testid="add-cert">
            <span className="g-dots" aria-hidden="true">
              {CERT_DOTS.map((n) => (
                <span key={n} className={n <= (hasPhoto ? 1 : 0) ? "g-dot is-on" : "g-dot"} />
              ))}
            </span>
            <p className="o-t-caption">
              <strong>{V.certTitle}</strong> · {certNoun} {SITE.photoOnlyOne}
            </p>
          </div>
        </section>

        {/* 2 · Plaque */}
        <section className="s-stack g-section" data-testid="add-plate">
          <h2 className="s-h2">{`2 · ${V.steps[1]}`}</h2>
          <TextField
            label={L.plateNumber}
            name="plate"
            autoCapitalize="characters"
            disabled={unregistered}
            help={L.privacyNote}
            error={errors.plate}
          />
          <CheckboxField
            name="unregistered"
            checked={unregistered}
            onChange={(e) => setUnregistered(e.currentTarget.checked)}
            label={L.unregistered}
          />
          <CheckboxField
            name="former"
            checked={former}
            onChange={(e) => {
              setFormer(e.currentTarget.checked);
              if (!e.currentTarget.checked) setStatus(archiveStatusChoices[0]?.status ?? "keepsake");
            }}
            label={L.formerTitle}
          />
          <p className="o-t-caption s-muted">{L.formerText}</p>
          {former && (
            <div className="s-stack s-stack--tight" data-testid="add-former">
              <SelectField
                label={SITE.formerStatus}
                name="status"
                value={status}
                onChange={(e) => setStatus(e.currentTarget.value)}
                options={archiveStatusChoices.map((c) => ({ value: c.status, label: c.label }))}
              />
              <TextField label={SITE.statusNote} name="statusNote" maxLength={300} />
              <p className="s-notice">{SITE.formerNotCertified}</p>
            </div>
          )}
        </section>

        {/* 3 · Marque et modèle */}
        <section className="s-stack g-section" data-testid="add-identity">
          <h2 className="s-h2">{`3 · ${V.steps[2]}`}</h2>
          <fieldset className="g-types" data-testid="add-types">
            <legend className="o-field__label o-t-label">{SITE.type}</legend>
            {vehicleTypes.map((t) => (
              <label key={t} className={type === t ? "g-opt g-type is-on" : "g-opt g-type"}>
                <input
                  type="radio"
                  name="vehicleType"
                  value={t}
                  checked={type === t}
                  onChange={() => {
                    setType(t);
                    setModelId("");
                  }}
                />
                <Icon name={typeIcon[t]} size={22} />
                <span className="o-t-body">{vehicleTypeLabels[t]}</span>
              </label>
            ))}
          </fieldset>
          {errors.vehicleType && <p className="s-error">{errors.vehicleType}</p>}
          <SelectField
            label={L.make}
            name="makeId"
            value={makeId}
            onChange={(e) => setMakeId(e.currentTarget.value)}
            placeholder="Choisir une marque"
            options={sortedMakes.map((m) => ({ value: m.id, label: m.isOther ? L.other : m.name }))}
            error={errors.makeId}
          />
          <SelectField
            label={L.model}
            name="modelId"
            value={modelId}
            onChange={(e) => setModelId(e.currentTarget.value)}
            placeholder={makeId ? "Choisir un modèle" : "Choisis d'abord une marque"}
            disabled={!makeId}
            options={visibleModels.map((m) => ({ value: m.id, label: m.isOther ? L.other : m.name }))}
            error={errors.modelId}
          />
          {generations.length > 0 && (
            <SelectField
              label={SITE.generation}
              name="generationId"
              value={generationId}
              onChange={(e) => setGenerationId(e.currentTarget.value)}
              placeholder={SITE.chooseGeneration}
              options={sortRows(generations, false).map((g) => ({
                value: g.id,
                label: g.isOther ? L.other : [g.name, generationYearsText(g)].filter(Boolean).join(" · "),
              }))}
            />
          )}
        </section>

        {/* 4 · Fiche technique */}
        <section className="s-stack g-section" data-testid="add-specs">
          <h2 className="s-h2">{`4 · ${V.steps[3]}`}</h2>
          <p className="o-t-body s-muted">{catalog ? V.specsText : V.specsTextFree}</p>
          {catalog && (
            <fieldset className="g-engines" data-testid="add-engines">
              <legend className="o-field__label o-t-label">{V.engines}</legend>
              {engines.map((e) => (
                <label key={e.id} className={engineId === e.id ? "g-opt g-engine is-on" : "g-opt g-engine"}>
                  <input
                    type="radio"
                    name="engineChoice"
                    value={e.id}
                    checked={engineId === e.id}
                    data-testid="add-engine-card"
                    onChange={() => pickEngine(e)}
                  />
                  <Icon name="power" size={20} />
                  <span className="g-engine__text">
                    <span className="o-t-body-strong g-engine__name">{e.name}</span>
                    <span className="o-t-caption">{V.engineFacts(e.powerHp, e.weightKg, e.drivetrain)}</span>
                  </span>
                </label>
              ))}
              <label
                className={otherEngine ? "g-opt g-engine g-engine--other is-on" : "g-opt g-engine g-engine--other"}
              >
                <input
                  type="radio"
                  name="engineChoice"
                  value="other"
                  checked={otherEngine}
                  data-testid="add-engine-other"
                  onChange={() => {
                    setEngineId(null);
                    setEngine("");
                    setPowerHp("");
                    setWeightKg("");
                  }}
                />
                <Icon name="edit" size={20} />
                <span className="g-engine__text">
                  <span className="o-t-body-strong">{V.otherEngine}</span>
                  <span className="o-t-caption">{V.otherEngineHint}</span>
                </span>
              </label>
            </fieldset>
          )}
          {otherEngine ? (
            <div className="s-stack s-stack--tight">
              <TextField
                label={L.engine}
                name="engine"
                value={engine}
                maxLength={80}
                placeholder={V.enginePlaceholder}
                onChange={(e) => setEngine(e.currentTarget.value)}
              />
              <div className="s-two">
                <TextField
                  label={L.power}
                  name="powerHp"
                  inputMode="numeric"
                  maxLength={4}
                  value={powerHp}
                  onChange={(e) => setPowerHp(e.currentTarget.value)}
                  error={errors.powerHp}
                />
                <TextField
                  label={L.weight}
                  name="weightKg"
                  inputMode="numeric"
                  maxLength={5}
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.currentTarget.value)}
                  error={errors.weightKg}
                />
              </div>
            </div>
          ) : (
            <>
              <input type="hidden" name="engine" value={engine} />
              <input type="hidden" name="powerHp" value={powerHp} />
              <input type="hidden" name="weightKg" value={weightKg} />
            </>
          )}
          {years.length > 0 ? (
            <fieldset className="g-years" data-testid="add-years">
              <legend className="o-field__label o-t-label">{V.year}</legend>
              {years.map((y) => (
                <label key={y} className={year === String(y) ? "g-opt g-pill is-on" : "g-opt g-pill"}>
                  <input
                    type="radio"
                    name="year"
                    value={y}
                    checked={year === String(y)}
                    data-testid={`add-year-${y}`}
                    onChange={() => setYear(String(y))}
                    onClick={() => year === String(y) && setYear("")}
                  />
                  <span className="o-t-body">{y}</span>
                </label>
              ))}
            </fieldset>
          ) : (
            <TextField
              label={V.year}
              name="year"
              inputMode="numeric"
              maxLength={4}
              value={year}
              onChange={(e) => setYear(e.currentTarget.value)}
              error={errors.year}
            />
          )}
          {years.length > 0 && errors.year && <p className="s-error">{errors.year}</p>}
          <ColorPicker
            value={color}
            custom={colorCustom}
            onChange={(next, custom) => {
              setColor(next);
              setColorCustom(custom);
            }}
          />
          {errors.color && <p className="s-error">{errors.color}</p>}
          <TextAreaField
            label={V.description}
            name="description"
            value={description}
            maxLength={VEHICLE_DESCRIPTION_MAX}
            placeholder={V.descriptionPlaceholder}
            onChange={(e) => setDescription(e.currentTarget.value.slice(0, VEHICLE_DESCRIPTION_MAX))}
            help={V.descriptionHint}
            error={errors.description}
          />
          <p className="o-t-caption g-count" data-testid="add-description-count">
            {V.descriptionCount(description.length, VEHICLE_DESCRIPTION_MAX)}
          </p>
          <fieldset className="g-pills" data-testid="add-preparation">
            <legend className="o-field__label o-t-label">{V.preparation}</legend>
            {vehiclePreparations.map((p) => (
              <label key={p} className={preparation.includes(p) ? "g-opt g-pill is-on" : "g-opt g-pill"}>
                <input
                  type="checkbox"
                  name="preparation"
                  value={p}
                  checked={preparation.includes(p)}
                  data-testid={`add-prep-${p}`}
                  onChange={() => togglePreparation(p)}
                />
                <span className="o-t-body">{vehiclePreparationLabels[p]}</span>
              </label>
            ))}
          </fieldset>
        </section>

        {/* 5 · Catégories */}
        <section className="s-stack g-section" data-testid="add-categories">
          <h2 className="s-h2">{`5 · ${V.steps[4]}`}</h2>
          {origins.map((o) => (
            <div key={o.id} className="g-origin" data-testid="add-origin">
              <input type="hidden" name="categoryIds" value={o.id} />
              <Flag country={make?.country ?? null} />
              <div className="g-origin__text">
                <span className="o-t-body-strong">
                  {V.originLine(o.label, make?.country ?? null, make?.name ?? "").title}
                </span>
                <span className="o-t-caption">
                  {V.originLine(o.label, make?.country ?? null, make?.name ?? "").detail}
                </span>
              </div>
              <span title={V.originLocked} role="img" aria-label={V.originLocked}>
                <Icon name="lock" size={16} />
              </span>
            </div>
          ))}
          <fieldset className="g-pills" data-testid="categories">
            <legend className="o-field__label o-t-label">{SITE.styles}</legend>
            {styles.map((c) => (
              <label
                key={c.id}
                className={
                  !c.eligible
                    ? "g-opt g-pill is-off"
                    : categoryIds.includes(c.id)
                      ? "g-opt g-pill is-on"
                      : "g-opt g-pill"
                }
                title={c.eligible ? undefined : (c.reason ?? undefined)}
              >
                <input
                  type="checkbox"
                  name="categoryIds"
                  value={c.id}
                  checked={c.eligible && categoryIds.includes(c.id)}
                  disabled={!c.eligible}
                  data-testid={c.eligible ? "add-style" : "add-style-off"}
                  onChange={() => toggleStyle(c.id)}
                />
                <span className="o-t-body">{c.label}</span>
              </label>
            ))}
          </fieldset>
          {note || preparedNote ? (
            <p className="s-notice" data-testid="add-styles-note">
              {[note, preparedNote ? V.preparedChecked : null].filter(Boolean).join(" ")}
            </p>
          ) : null}
        </section>

        {errors.form && (
          <p className="s-error" role="alert">
            {errors.form}
          </p>
        )}
        <Button type="submit" icon="send" loading={busy} fullWidth>
          {V.send}
        </Button>
        <Button variant="secondary" icon="back" href={retour ?? "/app/garage"} fullWidth>
          Annuler
        </Button>
      </Form>
      {cropFile && <SquareCrop file={cropFile} onDone={finishCrop} onCancel={() => finishCrop(null)} />}
    </div>
  );
}

/** « depuis 2019 », « 1993 – 2002 ». */
function generationYearsText(g: Pick<VehicleGeneration, "yearFrom" | "yearTo">): string | null {
  if (g.yearFrom && g.yearTo) return `${g.yearFrom} – ${g.yearTo}`;
  if (g.yearFrom) return L.since(g.yearFrom);
  return null;
}
