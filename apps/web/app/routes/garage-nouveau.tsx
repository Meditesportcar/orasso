import { Button, CheckboxField, SelectField, TextField } from "@orasso/design-system/web";
import {
  archiveStatusChoices,
  type CategoryOption,
  type VehicleCreate,
  type VehicleFull,
  type VehicleGeneration,
  type VehicleMake,
  type VehicleModel,
  vehicleTypeLabels,
  vehicleTypes,
} from "@orasso/shared";
import { useEffect, useState } from "react";
import { data, Form, redirect, useNavigation } from "react-router";

import { PhotoWithPlate, plateDecisionError } from "../components/PlateFrame";
import { apiFetch } from "../lib/api.client";
import { api, apiOrThrow, safeReturn } from "../lib/api.server";
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
  Record<"vehicleType" | "makeId" | "modelId" | "year" | "plate" | "photo" | "powerHp" | "weightKg" | "form", string>
>;

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
  if (active && !unregistered && !text("plate")) errors.plate = "Plaque obligatoire (ou coche « non immatriculé »).";
  if (yearText && !/^\d{4}$/.test(yearText)) errors.year = "Année sur 4 chiffres.";
  if (powerText && !/^\d{1,4}$/.test(powerText)) errors.powerHp = "Puissance en chevaux, nombre entier.";
  if (weightText && !/^\d{2,5}$/.test(weightText)) errors.weightKg = "Poids en kilos, nombre entier.";
  const hasPhoto = photo instanceof File && photo.size > 0;
  if (active && !hasPhoto) errors.photo = "Ajoute au moins une photo : elle est exigée pour candidater.";
  // Relecture du lot 51 : une photo part avec son cadre de plaque, ou « aucune plaque visible » coché.
  if (hasPhoto && plateDecisionError(form)) errors.photo = plateDecisionError(form) ?? undefined;
  if (Object.keys(errors).length) return data({ errors }, { status: 400 });

  const body: Partial<VehicleCreate> = {
    vehicleType: text("vehicleType") as VehicleCreate["vehicleType"],
    makeId: text("makeId"),
    modelId: text("modelId"),
    generationId: text("generationId") || null,
    year: yearText ? Number(yearText) : null,
    color: text("color") || null,
    powerHp: powerText ? Number(powerText) : null,
    weightKg: weightText ? Number(weightText) : null,
    plate: unregistered ? null : text("plate") || null,
    unregistered,
    status,
    statusNote: active ? null : text("statusNote") || null,
    categoryIds: form.getAll("categoryIds").map(String),
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

export default function GarageNouveau({ loaderData, actionData }: Route.ComponentProps) {
  const { makes, retour } = loaderData;
  const errors: Errors = actionData?.errors ?? {};
  const busy = useNavigation().state !== "idle";
  const [type, setType] = useState<string>("car");
  const [makeId, setMakeId] = useState("");
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [generations, setGenerations] = useState<VehicleGeneration[]>([]);
  const [unregistered, setUnregistered] = useState(false);
  const [year, setYear] = useState("");
  const [status, setStatus] = useState("active");
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const active = status === "active";

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
    if (!modelId) return;
    apiFetch<VehicleGeneration[]>(`/vehicle-reference/models/${modelId}/generations`).then((res) => {
      if (res.ok) setGenerations(res.data);
    });
  }, [modelId]);

  // Catégories filtrées par marque, type et année : celles qui ne conviennent pas sont grisées avec la raison.
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

  const visibleModels = models.filter((m) => m.vehicleType === type || m.isOther);

  return (
    <div className="s-narrow s-stack">
      <FicheBar title="Ajouter un véhicule" back={retour ?? "/app/garage"} />
      <p className="s-lead">
        L'essentiel pour candidater : le véhicule, sa plaque (visible par l'équipe organisatrice seulement) et une
        photo.
      </p>
      <Form method="post" encType="multipart/form-data" className="s-form">
        {retour && <input type="hidden" name="retour" value={retour} />}
        <SelectField
          label="Type"
          name="vehicleType"
          value={type}
          onChange={(e) => {
            setType(e.currentTarget.value);
            setModelId("");
          }}
          options={vehicleTypes.map((t) => ({ value: t, label: vehicleTypeLabels[t] }))}
          error={errors.vehicleType}
        />
        <SelectField
          label="Marque"
          name="makeId"
          value={makeId}
          onChange={(e) => setMakeId(e.currentTarget.value)}
          placeholder="Choisir une marque"
          options={makes.map((m) => ({ value: m.id, label: m.name }))}
          error={errors.makeId}
        />
        <SelectField
          label="Modèle"
          name="modelId"
          value={modelId}
          onChange={(e) => setModelId(e.currentTarget.value)}
          placeholder={makeId ? "Choisir un modèle" : "Choisis d'abord une marque"}
          disabled={!makeId}
          options={visibleModels.map((m) => ({ value: m.id, label: m.name }))}
          error={errors.modelId}
        />
        {generations.length > 0 && (
          <SelectField
            label="Génération (facultatif)"
            name="generationId"
            defaultValue=""
            options={[
              { value: "", label: "Je ne sais pas" },
              ...generations.map((g) => ({ value: g.id, label: g.name })),
            ]}
          />
        )}
        <TextField
          label="Année"
          name="year"
          inputMode="numeric"
          maxLength={4}
          value={year}
          onChange={(e) => setYear(e.currentTarget.value)}
          error={errors.year}
        />
        <div className="s-two">
          <TextField label="Puissance en ch (facultatif)" name="powerHp" inputMode="numeric" error={errors.powerHp} />
          <TextField label="Poids en kg (facultatif)" name="weightKg" inputMode="numeric" error={errors.weightKg} />
        </div>
        <TextField label="Couleur (facultatif)" name="color" />
        <SelectField
          label="Statut"
          name="status"
          value={status}
          onChange={(e) => setStatus(e.currentTarget.value)}
          options={[
            { value: "active", label: "Dans mon garage (actif)" },
            ...archiveStatusChoices.map((c) => ({ value: c.status, label: c.label })),
          ]}
          help="Un véhicule vendu, en souvenir ou accidenté ne candidate pas ; sa plaque est facultative."
        />
        {!active && <TextField label="Motif (facultatif)" name="statusNote" maxLength={300} />}
        <fieldset className="g-cats" data-testid="categories">
          <legend className="o-field__label o-t-label">Catégories</legend>
          {categories.map((c) => (
            <div key={c.id} className={c.eligible ? "g-cat" : "g-cat is-off"}>
              <label>
                <input type="checkbox" name="categoryIds" value={c.id} disabled={!c.eligible} />
                {c.label}
              </label>
              {!c.eligible && <span className="o-t-meta">{c.reason}</span>}
            </div>
          ))}
        </fieldset>
        <TextField
          label="Plaque"
          name="plate"
          autoCapitalize="characters"
          disabled={unregistered}
          help={
            active
              ? "Jamais affichée aux autres passionnés. Déjà prise par un autre membre ? Il sera prévenu et pourra confirmer le transfert."
              : "Facultative pour un véhicule archivé. Jamais affichée aux autres passionnés."
          }
          error={errors.plate}
        />
        <CheckboxField
          name="unregistered"
          checked={unregistered}
          onChange={(e) => setUnregistered(e.currentTarget.checked)}
          label="Véhicule non immatriculé"
        />
        <PhotoWithPlate
          label="Photo"
          help="Une photo de ton véhicule, de face ou de trois quarts. Tu floutes la plaque juste en dessous."
          error={errors.photo}
          required={active}
          testId="new-plate-frame"
        />
        {errors.form && (
          <p className="s-error" role="alert">
            {errors.form}
          </p>
        )}
        <Button type="submit" icon="check" loading={busy} fullWidth>
          Ajouter au garage
        </Button>
        <Button variant="secondary" icon="back" href={retour ?? "/app/garage"} fullWidth>
          Annuler
        </Button>
      </Form>
    </div>
  );
}
