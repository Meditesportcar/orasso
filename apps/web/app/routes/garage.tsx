import { Button, Chip, Plate, TextField, VehicleCard } from "@orasso/design-system/web";
import {
  type PlateTransferView,
  plateTransferLabels,
  type VehicleFull,
  type VehicleStatus,
  vehicleStatusLabels,
} from "@orasso/shared";
import { data, Form, useNavigation } from "react-router";

import { api, apiOrThrow } from "../lib/api.server";
import { formatDateTime } from "../lib/format";
import type { Route } from "./+types/garage";
import "../styles/garage.css";

export function meta() {
  return [{ title: "Garage · Orasso" }, { name: "robots", content: "noindex" }];
}

const ARCHIVED: Exclude<VehicleStatus, "active">[] = ["sold", "keepsake", "wrecked"];

export async function loader({ request }: Route.LoaderArgs) {
  const [vehicles, transfers] = await Promise.all([
    apiOrThrow<VehicleFull[]>(request, "/me/vehicles"),
    api<{ incoming: PlateTransferView[]; outgoing: PlateTransferView[] }>(request, "/me/plate-transfers"),
  ]);
  const photoRefused = new URL(request.url).searchParams.get("photo") === "refusee";
  return {
    vehicles: vehicles.filter((v) => v.status === "active"),
    archived: vehicles.filter((v) => v.status !== "active"),
    incoming: transfers.ok ? transfers.data.incoming : [],
    photoRefused,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "photo");
  if (intent === "transfer-accept" || intent === "transfer-decline") {
    const id = String(form.get("transferId") ?? "");
    const res = await api(request, `/plate-transfers/${encodeURIComponent(id)}/${intent.slice(9)}`, {
      method: "POST",
    });
    if (!res.ok) return data({ error: res.error.message }, { status: res.status });
    return data({ error: null });
  }
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
  const { vehicles, archived, incoming, photoRefused } = loaderData;
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

      {incoming.map((t) => (
        <Plate key={t.id} className="g-transfer" data-testid="plate-transfer-request">
          <div className="o-t-label">{plateTransferLabels.requestTitle}</div>
          <p>
            <strong>{t.requesterPseudo}</strong> a saisi la plaque de{" "}
            <strong className="o-never-truncate">{t.holderVehicleLabel}</strong>
            {t.plate ? ` (${t.plate})` : ""} pour son véhicule
            {t.requesterVehicleLabel ? ` ${t.requesterVehicleLabel}` : ""}. Si tu l'as vendu, confirme : ton véhicule
            passe « Vendu » et la plaque change de main. Sinon, l'équipe Orasso tranchera.
          </p>
          <p className="o-t-meta">Réponse attendue avant le {formatDateTime(t.answerBy)}.</p>
          <Form method="post" className="s-row">
            <input type="hidden" name="transferId" value={t.id} />
            <Button type="submit" name="intent" value="transfer-accept" variant="secondary" icon="check" loading={busy}>
              {plateTransferLabels.accept}
            </Button>
            <Button
              type="submit"
              name="intent"
              value="transfer-decline"
              variant="secondary"
              icon="close"
              loading={busy}
            >
              {plateTransferLabels.decline}
            </Button>
          </Form>
        </Plate>
      ))}

      {vehicles.length === 0 && (
        <p className="s-notice">Ton garage est vide. Ajoute un véhicule pour pouvoir candidater.</p>
      )}
      <div className="s-grid">
        {vehicles.map((v) => (
          <div key={v.id} className="s-stack s-stack--tight">
            <a className="g-card-link" href={`/app/garage/${v.id}`} aria-label={v.label}>
              <VehicleCard
                photo={v.photos[0] ? <img src={v.photos[0].url} alt="" /> : undefined}
                first
                certified={v.certified}
                photoCount={v.photos.length || undefined}
                name={v.label}
                year={v.year ?? undefined}
                power={v.powerHp ? `${v.powerHp} ch` : undefined}
                categories={v.categories.map((c) => ({ label: c.label }))}
                facts={
                  v.plateTransfer
                    ? plateTransferLabels.pending
                    : v.unregistered
                      ? "Non immatriculé"
                      : `Plaque ${v.plate ?? "—"}`
                }
              />
            </a>
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

      {archived.length > 0 && (
        <details className="g-archived" data-testid="garage-archived">
          <summary>Archivés · {archived.length}</summary>
          {ARCHIVED.map((status) => {
            const rows = archived.filter((v) => v.status === status);
            if (!rows.length) return null;
            return (
              <div key={status} className="g-archived__group">
                <Chip>{vehicleStatusLabels[status]}</Chip>
                {rows.map((v) => (
                  <a key={v.id} className="g-archived__row" href={`/app/garage/${v.id}`}>
                    <span className="g-archived__name o-never-truncate">
                      {v.label}
                      {v.year ? ` · ${v.year}` : ""}
                    </span>
                    {v.statusNote && <span className="o-t-meta">{v.statusNote}</span>}
                  </a>
                ))}
              </div>
            );
          })}
        </details>
      )}
    </div>
  );
}
