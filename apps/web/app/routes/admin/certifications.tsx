// Administration : demandes de certification de véhicules (lot 31). Validation manuelle : catégories respectées,
// photos et description conformes (docs/01 « Points et grades »).
import { Button, Chip, Plate } from "@orasso/design-system/web";
import {
  type AdminCertificationRequest,
  type CertificationStatus,
  certificationStatusLabels,
  gradeLabels,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { TextAreaField } from "../../components/Fields";
import { requireSuperAdmin } from "../../lib/admin.server";
import { api, apiOrThrow } from "../../lib/api.server";
import { formatDateTime } from "../../lib/format";
import type { Route } from "./+types/certifications";
import "../../styles/garage.css";

export function meta() {
  return [{ title: "Certifications · Administration · Orasso" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireSuperAdmin(request);
  const all = new URL(request.url).searchParams.get("tout") === "1";
  const rows = await apiOrThrow<AdminCertificationRequest[]>(
    request,
    `/admin/certification-requests${all ? "" : "?status=pending"}`,
  );
  return { rows, all };
}

export async function action({ request }: Route.ActionArgs) {
  await requireSuperAdmin(request);
  const form = await request.formData();
  const id = String(form.get("requestId") ?? "");
  const decision = String(form.get("intent")) === "accept" ? "accept" : "refuse";
  const note = String(form.get("note") ?? "").trim();
  if (decision === "refuse" && !note) {
    return data({ error: "Indique le motif du refus : il est envoyé au membre.", id }, { status: 400 });
  }
  const res = await api(request, `/admin/certification-requests/${encodeURIComponent(id)}/decide`, {
    method: "POST",
    json: { decision, note: note || null },
  });
  if (!res.ok) return data({ error: res.error.message, id }, { status: res.status });
  return redirect(`/admin/certifications?fait=${decision}`);
}

export default function AdminCertifications({ loaderData, actionData }: Route.ComponentProps) {
  const { rows, all } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Administration</div>
          <h1 className="s-title">Certifications</h1>
        </div>
        <div className="s-row">
          <Chip selected={!all} onClick={() => window.location.assign("/admin/certifications")}>
            À examiner
          </Chip>
          <Chip selected={all} onClick={() => window.location.assign("/admin/certifications?tout=1")}>
            Toutes
          </Chip>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="s-notice" data-testid="certifications-empty">
          Aucune demande de certification à examiner.
        </p>
      ) : (
        <div className="g-queue">
          {rows.map((r) => (
            <section
              key={r.id}
              className="orga__panel s-stack"
              aria-label={r.vehicleLabel}
              data-testid="certification-request"
            >
              <div className="s-row s-row--between">
                <div className="s-stack s-stack--tight">
                  <div className="s-label o-t-label">
                    Demandée le {formatDateTime(r.createdAt)} · {r.pseudo} · grade {gradeLabels[r.grade]}
                  </div>
                  <h2 className="s-h2 o-never-truncate">{r.vehicleLabel}</h2>
                </div>
                <Chip variant={r.status === "accepted" ? "verified" : undefined}>
                  {certificationStatusLabels[r.status as CertificationStatus]}
                </Chip>
              </div>
              <Plate className="s-stack s-stack--tight">
                <div className="o-t-label">Fiche examinée</div>
                <p>
                  {[
                    r.snapshot.year,
                    r.snapshot.engine,
                    r.snapshot.powerHp ? `${r.snapshot.powerHp} ch` : null,
                    r.snapshot.weightKg ? `${r.snapshot.weightKg} kg` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Fiche technique non renseignée"}
                </p>
                <p>Catégories : {r.snapshot.categories.join(", ") || "aucune"}</p>
                {r.snapshot.preparation && <p className="s-prewrap">Préparation : {r.snapshot.preparation}</p>}
                {r.snapshot.description && <p className="s-prewrap">{r.snapshot.description}</p>}
                {r.message && <p className="s-prewrap">Message : {r.message}</p>}
                <div className="g-queue__photos">
                  {r.snapshot.photoUrls.map((u) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer">
                      <img src={u} alt="" />
                    </a>
                  ))}
                </div>
              </Plate>
              {r.status === "pending" ? (
                <Form method="post" className="s-stack">
                  <input type="hidden" name="requestId" value={r.id} />
                  <TextAreaField label="Note (obligatoire pour un refus, envoyée au membre)" name="note" rows={2} />
                  {actionData && "error" in actionData && actionData.id === r.id && (
                    <p className="s-error" role="alert">
                      {actionData.error}
                    </p>
                  )}
                  <div className="s-row">
                    <Button type="submit" name="intent" value="accept" variant="secondary" icon="check" loading={busy}>
                      Certifier
                    </Button>
                    <Button type="submit" name="intent" value="refuse" variant="secondary" icon="close" loading={busy}>
                      Refuser
                    </Button>
                  </div>
                </Form>
              ) : (
                <p className="o-t-meta">
                  Décidée le {r.decidedAt ? formatDateTime(r.decidedAt) : "—"}
                  {r.note ? ` · ${r.note}` : ""}
                </p>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
