import { Button, CheckboxField, SelectField, TextField } from "@orasso/design-system/web";
import {
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

import { apiFetch } from "../lib/api.client";
import { api, apiOrThrow, safeReturn } from "../lib/api.server";
import type { Route } from "./+types/garage-nouveau";

export function meta() {
  return [{ title: "Ajouter un véhicule · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const retour = new URL(request.url).searchParams.get("retour");
  const makes = await apiOrThrow<VehicleMake[]>(request, "/vehicle-reference/makes");
  return { makes, retour: retour ? safeReturn(retour, "/app/garage") : null };
}

type Errors = Partial<Record<"vehicleType" | "makeId" | "modelId" | "year" | "plate" | "photo" | "form", string>>;

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const retour = text("retour");
  const unregistered = form.get("unregistered") === "on";
  const yearText = text("year");
  const photo = form.get("photo");
  const errors: Errors = {};
  if (!text("makeId")) errors.makeId = "Choisis une marque.";
  if (!text("modelId")) errors.modelId = "Choisis un modèle.";
  if (!unregistered && !text("plate")) errors.plate = "Plaque obligatoire (ou coche « non immatriculé »).";
  if (yearText && !/^\d{4}$/.test(yearText)) errors.year = "Année sur 4 chiffres.";
  if (!(photo instanceof File) || photo.size === 0)
    errors.photo = "Ajoute au moins une photo : elle est exigée pour candidater.";
  if (Object.keys(errors).length) return data({ errors }, { status: 400 });

  const body: Partial<VehicleCreate> = {
    vehicleType: text("vehicleType") as VehicleCreate["vehicleType"],
    makeId: text("makeId"),
    modelId: text("modelId"),
    generationId: text("generationId") || null,
    year: yearText ? Number(yearText) : null,
    color: text("color") || null,
    plate: unregistered ? null : text("plate"),
    unregistered,
  };
  const created = await api<VehicleFull>(request, "/me/vehicles", { method: "POST", json: body });
  if (!created.ok) {
    const field = created.error.code === "plate_taken" ? "plate" : "form";
    return data({ errors: { [field]: created.error.message } satisfies Errors }, { status: created.status });
  }
  const upload = new FormData();
  upload.set("photo", photo as File);
  const sent = await api(request, `/me/vehicles/${created.data.id}/photos`, { method: "POST", body: upload });
  if (!sent.ok) {
    // Le véhicule existe : on reste sur la fiche avec le message, la photo se rajoute depuis le garage.
    return redirect(`/app/garage?photo=refusee`);
  }
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

  const visibleModels = models.filter((m) => m.vehicleType === type || m.isOther);

  return (
    <div className="s-narrow s-stack">
      <h1 className="s-title">Ajouter un véhicule</h1>
      <p className="s-lead">
        L'essentiel pour candidater : le véhicule, sa plaque (visible par l'organisateur seulement) et une photo.
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
        <TextField label="Année" name="year" inputMode="numeric" maxLength={4} error={errors.year} />
        <TextField label="Couleur (facultatif)" name="color" />
        <TextField
          label="Plaque"
          name="plate"
          autoCapitalize="characters"
          disabled={unregistered}
          help="Jamais affichée aux autres passionnés."
          error={errors.plate}
        />
        <CheckboxField
          name="unregistered"
          checked={unregistered}
          onChange={(e) => setUnregistered(e.currentTarget.checked)}
          label="Véhicule non immatriculé"
        />
        <TextField
          label="Photo"
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          help="Une photo de ton véhicule, de face ou de trois quarts."
          error={errors.photo}
          required
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
