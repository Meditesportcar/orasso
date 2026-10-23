// Ajout d'un véhicule sur le site (lot M1) : la même chose que l'appli, dans le même ordre et avec les mêmes mots, en une
// seule page de cinq sections (Photos, Plaque, Marque et modèle, Fiche technique, Catégories) puis « Envoyer ».
// Formulaire serveur (`Form` + `action`) : l'essentiel marche sans JavaScript ; les listes liées (modèles, catégories),
// le recadrage carré et le nuancier demandent JavaScript. Les règles métier restent dans l'API. Décision de Damien du
// 23/10 (lot M1, tour 2) : motorisation, puissance et poids en saisie libre, pas de catalogue.
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
  VEHICLE_ENGINE_MAX,
  type VehicleCreate,
  type VehicleFull,
  type VehicleGeneration,
  type VehicleMake,
  type VehicleModel,
  type VehiclePreparation,
  vehiclePreparationLabels,
  vehiclePreparations,
  vehicleSpecsIssue,
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
  plateFields,
  preparedCategory,
  sortRows,
  visibleStyles,
  yearChoices,
} from "../lib/vehicle-add";
import type { Route } from "./+types/garage-nouveau";
import "../styles/garage.css";
import { FicheBar, ficheHandle } from "../components/FicheBar";

// Lot M7 : fiche ou parcours, mode B (en-tête de fiche, sans bande ni barre d'onglets).
export const handle = ficheHandle;

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
    | "engine"
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
  // Lot M1, tour 2 : jusqu'à trois photos à la création (« photo », « photo2 », « photo3 »), chacune avec sa plaque.
  const photos = PHOTO_SLOTS.flatMap((suffix, i) => {
    const file = form.get(`photo${suffix}`);
    return file instanceof File && file.size > 0 ? [{ suffix, n: i + 1, file }] : [];
  });
  const errors: Errors = {};
  if (!text("makeId")) errors.makeId = "Choisis une marque.";
  if (!text("modelId")) errors.modelId = "Choisis un modèle.";
  if (active && !unregistered && !text("plate")) errors.plate = L.plateRequired;
  if (yearText && !/^\d{4}$/.test(yearText)) errors.year = "Année sur 4 chiffres.";
  // Décision de Damien du 23/10 : saisie libre, mêmes bornes que l'appli et l'API (`vehicleSpecsIssue`).
  const engineIssue = vehicleSpecsIssue({ engine: text("engine") });
  if (engineIssue) errors.engine = engineIssue;
  const powerIssue = vehicleSpecsIssue({ powerHp: powerText });
  if (powerIssue) errors.powerHp = powerIssue;
  const weightIssue = vehicleSpecsIssue({ weightKg: weightText });
  if (weightIssue) errors.weightKg = weightIssue;
  if (text("color").length > 40) errors.color = "Teinte : 40 caractères au plus.";
  if (text("description").length > VEHICLE_DESCRIPTION_MAX) {
    errors.description = `Description : ${VEHICLE_DESCRIPTION_MAX} caractères au plus.`;
  }
  if (active && photos.length === 0) errors.photo = "Ajoute au moins une photo : elle est exigée pour candidater.";
  // Relecture du lot 51 : chaque photo part avec son cadre de plaque, ou « aucune plaque visible » coché.
  for (const p of photos) {
    const issue = plateDecisionError(form, p.suffix, photos.length > 1 ? p.n : undefined);
    if (issue) {
      errors.photo = issue;
      break;
    }
  }
  if (Object.keys(errors).length) return data({ errors }, { status: 400 });

  const preparation = form
    .getAll("preparation")
    .map(String)
    .filter((p): p is VehiclePreparation => preparationKeys.has(p));
  // Une préparation choisie coche « Préparée » côté page ; lot M1, tour 2 : la case reste décochable, comme dans
  // l'appli (l'action n'en rajoute plus d'office).
  const categoryIds = form.getAll("categoryIds").map(String);

  const body: Partial<VehicleCreate> = {
    vehicleType: text("vehicleType") as VehicleCreate["vehicleType"],
    makeId: text("makeId"),
    modelId: text("modelId"),
    generationId: text("generationId") || null,
    year: yearText ? Number(yearText) : null,
    color: text("color") || null,
    engine: text("engine") || null,
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
  if (photos.length === 0) return redirect(`/app/garage/${created.data.id}`);
  for (const p of photos) {
    const upload = new FormData();
    upload.set("photo", p.file);
    // Lot 51 : cadres de plaque posés à la main, floutés par l'API avant le stockage (définitif) ; lot M1, tour 2 :
    // sinon « aucune plaque visible » confirmé, que l'API exige aussi.
    plateFields(form, upload, p.suffix);
    const sent = await api(request, `/me/vehicles/${created.data.id}/photos`, { method: "POST", body: upload });
    if (!sent.ok) {
      // Le véhicule existe : on reste sur la fiche avec le message, la photo se rajoute depuis le garage.
      return redirect(`/app/garage?photo=refusee`);
    }
  }
  // Plaque d'un autre membre : le véhicule existe, en attente de transfert (S36) ; on ouvre sa page pour l'expliquer.
  if (created.data.plateTransfer) return redirect(`/app/garage/${created.data.id}`);
  const back = safeReturn(retour, "/app/garage");
  if (retour) return redirect(`${back}${back.includes("?") ? "&" : "?"}vehicule=${created.data.id}`);
  return redirect("/app/garage");
}

// Textes propres au site (les autres viennent de `vehicleAddLabels` et `vehicleWizardLabels`).
const SITE = {
  photoOnlyOne: "Jusqu'à 3 photos ici : les autres s'ajoutent depuis la fiche de ton véhicule.",
  photoHelp: "Une photo de ton véhicule, de face ou de trois quarts. Elle sera recadrée au carré.",
  photoMoreHelp: "Facultative. Recadrée au carré, avec sa plaque à masquer.",
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
/** Lot M1, tour 2 : les champs des photos de la création (le premier garde son nom d'avant). */
const PHOTO_SLOTS = ["", "2", "3"] as const;

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
  // Photos choisies, emplacement par emplacement (la suivante apparaît quand la précédente est choisie).
  const [picked, setPicked] = useState<boolean[]>(PHOTO_SLOTS.map(() => false));
  const photoCount = picked.filter(Boolean).length;
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

  // Catégories filtrées par marque, modèle (tout-terrain : « 4x4 »), type et année.
  useEffect(() => {
    const query = new URLSearchParams({ vehicleType: type });
    if (makeId) query.set("makeId", makeId);
    if (makeId && modelId) query.set("modelId", modelId);
    if (/^\d{4}$/.test(year)) query.set("year", year);
    let stale = false;
    apiFetch<CategoryOption[]>(`/vehicle-reference/categories?${query}`).then((res) => {
      if (!stale && res.ok) setCategories(res.data);
    });
    return () => {
      stale = true;
    };
  }, [type, makeId, modelId, year]);

  const make = makes.find((m) => m.id === makeId);
  const sortedMakes = useMemo(() => sortRows(makes), [makes]);
  const visibleModels = useMemo(
    () => sortRows(modelsForType(models, type as "car" | "moto" | "truck")),
    [models, type],
  );
  const generation = generations.find((g) => g.id === generationId);
  const years = yearChoices(generation, new Date().getFullYear());
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

  const togglePreparation = (key: string) => {
    const next = preparation.includes(key) ? preparation.filter((p) => p !== key) : [...preparation, key];
    setPreparation(next);
    // Une préparation choisie coche « Préparée » ; la retirer tout à fait ne décoche rien (le choix reste à la personne).
    if (next.length && prepared) setCategoryIds((ids) => (ids.includes(prepared.id) ? ids : [...ids, prepared.id]));
  };
  const toggleStyle = (id: string) =>
    setCategoryIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(0, 10)));

  const certNoun =
    photoCount >= CERTIFICATION_MIN_PHOTOS ? V.certReady : photoCount ? V.certSome(photoCount) : V.certNone;

  return (
    <>
      <FicheBar title={L.title} back={retour ?? "/app/garage"} />
      <div className="s-narrow s-stack">
        <Form method="post" encType="multipart/form-data" className="s-form g-add" data-testid="vehicle-add-form">
          {retour && <input type="hidden" name="retour" value={retour} />}

          {/* 1 · Photos */}
          <section className="s-stack g-section" data-testid="add-photos">
            <h2 className="s-h2">{`1 · ${V.steps[0]}`}</h2>
            <p className="o-t-body s-muted">{V.photosText}</p>
            {PHOTO_SLOTS.map((suffix, i) =>
              i === 0 || picked[i - 1] || picked[i] ? (
                <PhotoWithPlate
                  key={suffix || "1"}
                  label={i === 0 ? "Photo" : V.photoN(i + 1)}
                  help={i === 0 ? SITE.photoHelp : SITE.photoMoreHelp}
                  error={i === 0 ? errors.photo : undefined}
                  required={i === 0 && active}
                  testId={i === 0 ? "new-plate-frame" : `new-plate-frame-${i + 1}`}
                  prepare={prepare}
                  suffix={suffix}
                  onPicked={(on) => setPicked((all) => all.map((v, j) => (j === i ? on : v)))}
                />
              ) : null,
            )}
            <div className="g-cert" data-testid="add-cert">
              <span className="g-dots" aria-hidden="true">
                {CERT_DOTS.map((n) => (
                  <span key={n} className={n <= photoCount ? "g-dot is-on" : "g-dot"} />
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
            <p className="o-t-body s-muted">{V.specsText}</p>
            <div className="s-stack s-stack--tight" data-testid="add-engine-fields">
              <TextField
                label={L.engine}
                name="engine"
                value={engine}
                maxLength={VEHICLE_ENGINE_MAX}
                help={V.engineHelp}
                onChange={(e) => setEngine(e.currentTarget.value)}
                error={errors.engine}
              />
              <div className="s-two">
                <TextField
                  label={L.power}
                  name="powerHp"
                  inputMode="numeric"
                  maxLength={4}
                  value={powerHp}
                  help={V.powerHelp}
                  onChange={(e) => setPowerHp(e.currentTarget.value.replace(/\D/g, ""))}
                  error={errors.powerHp}
                />
                <TextField
                  label={L.weight}
                  name="weightKg"
                  inputMode="numeric"
                  maxLength={5}
                  value={weightKg}
                  help={V.weightHelp}
                  onChange={(e) => setWeightKg(e.currentTarget.value.replace(/\D/g, ""))}
                  error={errors.weightKg}
                />
              </div>
            </div>
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
    </>
  );
}

/** « depuis 2019 », « 1993 – 2002 ». */
function generationYearsText(g: Pick<VehicleGeneration, "yearFrom" | "yearTo">): string | null {
  if (g.yearFrom && g.yearTo) return `${g.yearFrom} – ${g.yearTo}`;
  if (g.yearFrom) return L.since(g.yearFrom);
  return null;
}
