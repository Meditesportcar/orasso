import { Button, TextField, VehicleCard } from "@orasso/design-system/web";
import type { VehicleFull } from "@orasso/shared";
import { data, Form, useNavigation } from "react-router";

import { api, apiOrThrow } from "../lib/api.server";
import type { Route } from "./+types/garage";

export function meta() {
  return [{ title: "Garage · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const vehicles = await apiOrThrow<VehicleFull[]>(request, "/me/vehicles");
  const photoRefused = new URL(request.url).searchParams.get("photo") === "refusee";
  return { vehicles: vehicles.filter((v) => v.status === "active"), photoRefused };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const vehicleId = String(form.get("vehicleId") ?? "");
  const photo = form.get("photo");
  if (!vehicleId || !(photo instanceof File) || photo.size === 0) {
    return data({ error: "Choisis une photo." }, { status: 400 });
  }
  const upload = new FormData();
  upload.set("photo", photo);
  const res = await api(request, `/me/vehicles/${vehicleId}/photos`, { method: "POST", body: upload });
  if (!res.ok) return data({ error: res.error.message }, { status: res.status });
  return data({ error: null });
}

export default function Garage({ loaderData, actionData }: Route.ComponentProps) {
  const { vehicles, photoRefused } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <div className="s-stack">
      <div className="s-row s-row--between">
        <h1 className="s-title">Garage</h1>
        <Button variant="primary" icon="add" href="/app/garage/nouveau">
          Ajouter un véhicule
        </Button>
      </div>
      {photoRefused && (
        <p className="s-notice s-notice--alert">
          Le véhicule est ajouté, mais la photo n'a pas été acceptée. Ajoutes-en une depuis sa fiche.
        </p>
      )}
      {actionData?.error && (
        <p className="s-error" role="alert">
          {actionData.error}
        </p>
      )}
      {vehicles.length === 0 && (
        <p className="s-notice">Ton garage est vide. Ajoute un véhicule pour pouvoir candidater.</p>
      )}
      <div className="s-grid">
        {vehicles.map((v) => (
          <div key={v.id} className="s-stack s-stack--tight">
            <VehicleCard
              photo={v.photos[0] ? <img src={v.photos[0].url} alt="" /> : undefined}
              first
              certified={v.certified}
              photoCount={v.photos.length || undefined}
              name={v.label}
              year={v.year ?? undefined}
              power={v.powerHp ? `${v.powerHp} ch` : undefined}
              categories={v.categories.map((c) => ({ label: c.label }))}
              facts={v.unregistered ? "Non immatriculé" : `Plaque ${v.plate ?? "—"}`}
            />
            {v.photos.length === 0 && (
              <Form method="post" encType="multipart/form-data" className="s-form">
                <input type="hidden" name="vehicleId" value={v.id} />
                <TextField
                  label="Ajouter une photo"
                  name="photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                />
                <Button type="submit" variant="secondary" icon="add" loading={busy}>
                  Envoyer la photo
                </Button>
              </Form>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
