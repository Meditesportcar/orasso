// Administration : transferts de plaque à arbitrer (lot 31, S36). L'ancien propriétaire a refusé ou n'a pas répondu
// en 7 jours ; l'équipe tranche : la plaque change de main (l'ancien véhicule passe « Vendu »), ou le véhicule du
// demandeur devient non immatriculé.
import { Button, Chip, Plate } from "@orasso/design-system/web";
import { type AdminPlateTransfer, plateTransferLabels } from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { TextAreaField } from "../../components/Fields";
import { requireSuperAdmin } from "../../lib/admin.server";
import { api, apiOrThrow } from "../../lib/api.server";
import { formatDateTime } from "../../lib/format";
import type { Route } from "./+types/transferts";
import "../../styles/garage.css";

export function meta() {
  return [
    { title: "Transferts de plaque · Administration · Orasso" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireSuperAdmin(request);
  return { rows: await apiOrThrow<AdminPlateTransfer[]>(request, "/admin/plate-transfers") };
}

export async function action({ request }: Route.ActionArgs) {
  await requireSuperAdmin(request);
  const form = await request.formData();
  const id = String(form.get("transferId") ?? "");
  const decision = String(form.get("intent")) === "accept" ? "accept" : "refuse";
  const note = String(form.get("note") ?? "").trim();
  const res = await api(request, `/admin/plate-transfers/${encodeURIComponent(id)}/decide`, {
    method: "POST",
    json: { decision, note: note || null },
  });
  if (!res.ok) return data({ error: res.error.message, id }, { status: res.status });
  return redirect(`/admin/transferts?fait=${decision}`);
}

export default function AdminTransfers({ loaderData, actionData }: Route.ComponentProps) {
  const { rows } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Administration</div>
          <h1 className="s-title">Transferts de plaque</h1>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="s-notice" data-testid="transfers-empty">
          Aucun transfert de plaque à arbitrer.
        </p>
      ) : (
        <div className="g-queue">
          {rows.map((t) => (
            <section
              key={t.id}
              className="orga__panel s-stack"
              aria-label={`Plaque ${t.plate ?? ""}`}
              data-testid="plate-transfer"
            >
              <div className="s-row s-row--between">
                <div className="s-stack s-stack--tight">
                  <div className="s-label o-t-label">Demandé le {formatDateTime(t.createdAt)}</div>
                  <h2 className="s-h2">Plaque {t.plate ?? "—"}</h2>
                </div>
                <Chip variant={t.status === "arbitrated" ? "accent" : undefined}>
                  {t.status === "arbitrated" ? plateTransferLabels.arbitrated : "En attente de l'ancien propriétaire"}
                </Chip>
              </div>
              <Plate className="s-stack s-stack--tight">
                <p>
                  Porte aujourd'hui la plaque : <strong>{t.holderPseudo}</strong>,{" "}
                  <span className="o-never-truncate">{t.holderVehicleLabel}</span>.
                </p>
                <p>
                  La réclame : <strong>{t.requesterPseudo}</strong>
                  {t.requesterVehicleLabel ? (
                    <>
                      , <span className="o-never-truncate">{t.requesterVehicleLabel}</span>
                    </>
                  ) : null}
                  .
                </p>
                {t.note && <p className="o-t-meta">{t.note}</p>}
              </Plate>
              <Form method="post" className="s-stack">
                <input type="hidden" name="transferId" value={t.id} />
                <TextAreaField label="Note (envoyée au demandeur)" name="note" rows={2} />
                {actionData && "error" in actionData && actionData.id === t.id && (
                  <p className="s-error" role="alert">
                    {actionData.error}
                  </p>
                )}
                <div className="s-row">
                  <Button type="submit" name="intent" value="accept" variant="secondary" icon="check" loading={busy}>
                    La plaque change de main
                  </Button>
                  <Button type="submit" name="intent" value="refuse" variant="secondary" icon="close" loading={busy}>
                    Refuser : non immatriculé
                  </Button>
                </div>
              </Form>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
