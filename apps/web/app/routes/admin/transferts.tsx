// Administration : transferts de plaque à arbitrer (lot 31, S36). L'ancien propriétaire a refusé ou n'a pas répondu
// en 7 jours ; l'équipe tranche : la plaque change de main (l'ancien véhicule passe « Vendu »), ou le véhicule du
// demandeur devient non immatriculé. Lot C7 : sous les transferts, les conflits de plaque laissés par la forme unique
// (lot M2) : appliquer la forme unique quand plus personne ne la porte, ou classer le conflit (même écran dans l'appli).
import { Button, Chip, Plate } from "@orasso/design-system/web";
import { type AdminPlateConflict, type AdminPlateTransfer, plateTransferLabels } from "@orasso/shared";
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
  const [rows, conflicts] = await Promise.all([
    apiOrThrow<AdminPlateTransfer[]>(request, "/admin/plate-transfers"),
    apiOrThrow<AdminPlateConflict[]>(request, "/admin/plate-conflicts"),
  ]);
  return { rows, conflicts };
}

export async function action({ request }: Route.ActionArgs) {
  await requireSuperAdmin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (intent === "conflict-apply" || intent === "conflict-dismiss") {
    const conflictId = String(form.get("conflictId") ?? "");
    const action = intent === "conflict-apply" ? "apply" : "dismiss";
    const note = String(form.get("note") ?? "").trim();
    const res = await api(request, `/admin/plate-conflicts/${encodeURIComponent(conflictId)}/resolve`, {
      method: "POST",
      json: { action, note: note || null },
    });
    if (!res.ok) return data({ error: res.error.message, id: conflictId }, { status: res.status });
    return redirect(`/admin/transferts?fait=conflit-${action}`);
  }
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
  const { rows, conflicts } = loaderData;
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
      <section className="s-stack" aria-labelledby="conflicts-title" data-testid="plate-conflicts">
        <h2 id="conflicts-title" className="s-h2">
          Conflits de plaque
        </h2>
        <p className="s-muted">
          Plaques qui gardent leur ancienne forme parce qu'une autre porte déjà la forme unique (accents, bande F,
          département).
        </p>
        {conflicts.length === 0 ? (
          <p className="s-notice">Aucun conflit de plaque.</p>
        ) : (
          <div className="g-queue">
            {conflicts.map((c) => (
              <section key={c.id} className="orga__panel s-stack" data-testid="plate-conflict">
                <div className="s-stack s-stack--tight">
                  <div className="s-label o-t-label">Relevé le {formatDateTime(c.createdAt)}</div>
                  <h3 className="s-h2">Plaque {c.plate}</h3>
                </div>
                <Plate className="s-stack s-stack--tight">
                  <p>
                    {c.kind === "vehicle" ? "Véhicule" : "Demande de transfert"} : <strong>{c.ownerPseudo}</strong>
                    {c.vehicleLabel ? (
                      <>
                        , <span className="o-never-truncate">{c.vehicleLabel}</span>
                      </>
                    ) : null}
                    .
                  </p>
                  <p>
                    Forme gardée : <strong>{c.keptNormalized}</strong> · forme unique :{" "}
                    <strong>{c.wantedNormalized}</strong>
                  </p>
                  <p>
                    Porte déjà la forme unique :{" "}
                    {c.holder ? (
                      <>
                        <strong>{c.holder.pseudo}</strong>
                        {c.holder.label ? <span className="o-never-truncate">, {c.holder.label}</span> : null}
                      </>
                    ) : (
                      "personne, elle est libre"
                    )}
                    .
                  </p>
                </Plate>
                <Form method="post" className="s-stack">
                  <input type="hidden" name="conflictId" value={c.id} />
                  <TextAreaField label="Note (journal de l'équipe)" name="note" rows={2} />
                  {actionData && "error" in actionData && actionData.id === c.id && (
                    <p className="s-error" role="alert">
                      {actionData.error}
                    </p>
                  )}
                  <div className="s-row">
                    <Button
                      type="submit"
                      name="intent"
                      value="conflict-apply"
                      variant="secondary"
                      icon="check"
                      loading={busy}
                      disabled={c.holder !== null}
                    >
                      Appliquer la forme unique
                    </Button>
                    <Button
                      type="submit"
                      name="intent"
                      value="conflict-dismiss"
                      variant="secondary"
                      icon="close"
                      loading={busy}
                    >
                      Classer le conflit
                    </Button>
                  </div>
                </Form>
              </section>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
