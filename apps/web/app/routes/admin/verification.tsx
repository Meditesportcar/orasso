// Administration (lot 13) : file des structures à vérifier (déplacée de l'accueil au lot 33 ; les interrupteurs de la
// billetterie sont dans `/admin/reglages`). Réservée au super admin.
import { Button, Chip, Plate } from "@orasso/design-system/web";
import {
  type AdminStructureRow,
  structureKindLabels,
  structureVerificationLabels,
  verificationDocumentKindLabels,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { TextAreaField } from "../../components/Fields";
import { requireSuperAdmin } from "../../lib/admin.server";
import { api, apiOrThrow } from "../../lib/api.server";
import { formatDateTime } from "../../lib/format";
import type { Route } from "./+types/verification";

export async function loader({ request }: Route.LoaderArgs) {
  await requireSuperAdmin(request);
  const all = new URL(request.url).searchParams.get("tout") === "1";
  const rows = await apiOrThrow<AdminStructureRow[]>(request, `/admin/structures?status=${all ? "all" : "pending"}`);
  return { rows, all };
}

export async function action({ request }: Route.ActionArgs) {
  await requireSuperAdmin(request);
  const form = await request.formData();
  const id = String(form.get("structureId") ?? "");
  const verified = String(form.get("intent")) === "verify";
  const note = String(form.get("note") ?? "").trim();
  if (!verified && !note) {
    return data({ error: "Indique le motif du refus : il est envoyé au propriétaire.", id }, { status: 400 });
  }
  const res = await api(request, `/admin/structures/${encodeURIComponent(id)}/verify`, {
    method: "POST",
    json: { verified, note: note || null },
  });
  if (!res.ok) return data({ error: res.error.message, id }, { status: res.status });
  return redirect(`/admin/verification?fait=${verified ? "valide" : "refuse"}`);
}

export default function Admin({ loaderData, actionData }: Route.ComponentProps) {
  const { rows, all } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Administration</div>
          <h1 className="s-title">Structures à vérifier</h1>
        </div>
        <div className="s-row">
          <Chip selected={!all} onClick={() => window.location.assign("/admin/verification")}>
            En cours
          </Chip>
          <Chip selected={all} onClick={() => window.location.assign("/admin/verification?tout=1")}>
            Toutes
          </Chip>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="s-notice" data-testid="admin-empty">
          Aucune structure en attente de vérification.
        </p>
      ) : (
        rows.map((s) => {
          const check = s.registryCheck;
          const mismatch = check?.status === "matched" && s.kind === "association" && !check.isAssociation;
          return (
            <section key={s.id} className="orga__panel s-stack" data-testid="admin-structure" aria-label={s.name}>
              <div className="s-row s-row--between">
                <div className="s-stack s-stack--tight">
                  <div className="s-label o-t-label">
                    {structureKindLabels[s.kind]} · créée le {formatDateTime(s.createdAt)}
                  </div>
                  <h2 className="s-h2">{s.name}</h2>
                  <div className="o-t-meta">
                    {[s.city, s.department].filter(Boolean).join(" · ")}
                    {s.owner ? ` · propriétaire ${s.owner.pseudo} (${s.owner.email})` : ""}
                  </div>
                </div>
                <Chip variant={s.verification === "verified" ? "accent" : undefined}>
                  {structureVerificationLabels[s.verification]}
                </Chip>
              </div>

              <Plate as="div" className="s-stack s-stack--tight">
                <div className="o-t-label">Contrôle du registre</div>
                {check ? (
                  <p data-testid="admin-registry">
                    {check.status === "matched"
                      ? "Trouvé et actif"
                      : check.status === "closed"
                        ? "Établissement fermé"
                        : check.status === "not_found"
                          ? "Introuvable"
                          : "Registre indisponible"}
                    {check.name ? ` · ${check.name}` : ""}
                    {check.address ? ` · ${check.address}` : ""} · {check.source === "siret" ? "SIRET" : "RNA"}{" "}
                    {s.siret ?? s.rna ?? check.query}
                  </p>
                ) : (
                  <p>Aucun numéro contrôlé (club non déclaré ?).</p>
                )}
                {mismatch && <p className="s-notice">Le numéro n'est pas celui d'une association.</p>}
              </Plate>

              <Plate as="div" className="s-stack s-stack--tight">
                <div className="o-t-label">Justificatifs</div>
                {s.documents.length === 0 ? (
                  <p>Aucun justificatif.</p>
                ) : (
                  <ul className="s-docs">
                    {s.documents.map((d) => (
                      <li key={d.id}>
                        {verificationDocumentKindLabels[d.kind]} ·{" "}
                        <a href={`/api/admin/verification-documents/${d.id}`} target="_blank" rel="noreferrer">
                          {d.fileName}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </Plate>

              {s.verification === "pending" && (
                <Form method="post" className="s-stack">
                  <input type="hidden" name="structureId" value={s.id} />
                  <TextAreaField
                    label="Note (obligatoire pour un refus, envoyée au propriétaire)"
                    name="note"
                    rows={2}
                  />
                  {actionData && "error" in actionData && actionData.id === s.id && (
                    <p className="s-error" role="alert">
                      {actionData.error}
                    </p>
                  )}
                  <div className="s-row">
                    <Button type="submit" name="intent" value="verify" variant="secondary" icon="check" loading={busy}>
                      Valider
                    </Button>
                    <Button type="submit" name="intent" value="refuse" variant="secondary" icon="close" loading={busy}>
                      Refuser
                    </Button>
                  </div>
                </Form>
              )}
            </section>
          );
        })
      )}
    </>
  );
}
