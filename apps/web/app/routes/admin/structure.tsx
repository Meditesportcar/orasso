// Administration : fiche d'une structure (lot 27). Badge (renouveler, suspendre, lever) et changement de propriétaire
// sur justificatif, par l'équipe Orasso seulement (docs/01 : « l'équipe peut intervenir à tout moment sur justificatif »).
// Le justificatif est téléversé ici (document « autre », visible de l'équipe seulement) ; tout est au journal.
import { Button, Chip, SelectField, TextField } from "@orasso/design-system/web";
import {
  type AdminStructureDetail,
  afterEventLabels as L,
  type StructureRole,
  structureRoleLabels,
  structureVerificationLabels,
  suspensionReasonLabels,
  verificationDocumentKindLabels,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { FileField, TextAreaField } from "../../components/Fields";
import { requireSuperAdmin } from "../../lib/admin.server";
import { api, apiOrThrow } from "../../lib/api.server";
import { formatDay } from "../../lib/format";
import type { Route } from "./+types/structure";
import "../../styles/after-event.css";

export function meta() {
  return [{ title: "Structure · Administration · Orasso" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireSuperAdmin(request);
  const structure = await apiOrThrow<AdminStructureDetail>(request, `/admin/structures/${params.id}`);
  return { structure, done: new URL(request.url).searchParams.get("fait") };
}

type Result = { section: "badge" | "document" | "transfer"; error?: string };

export async function action({ request, params }: Route.ActionArgs) {
  await requireSuperAdmin(request);
  const form = await request.formData();
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const intent = text("intent");
  const base = `/admin/structures/${encodeURIComponent(params.id)}`;
  const fail = (section: Result["section"], res: { status: number; error: { message: string } }) =>
    data({ section, error: res.error.message } satisfies Result, { status: res.status });

  if (intent === "document") {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return data({ section: "document", error: "Choisis un fichier à envoyer." } satisfies Result, { status: 400 });
    }
    const upload = new FormData();
    upload.set("file", file);
    const res = await api(request, `${base}/documents`, { method: "POST", body: upload });
    return res.ok ? redirect(`/admin/structures/${params.id}?fait=document`) : fail("document", res);
  }
  if (intent === "transfer") {
    const res = await api(request, `${base}/transfer-owner`, {
      method: "POST",
      json: { pseudo: text("pseudo"), reason: text("reason"), documentId: text("documentId") },
    });
    return res.ok ? redirect(`/admin/structures/${params.id}?fait=transfer`) : fail("transfer", res);
  }
  const path = intent === "renew" ? "renew-badge" : intent === "suspend" ? "suspend" : "lift";
  const res = await api(request, `${base}/${path}`, {
    method: "POST",
    json: intent === "renew" ? { note: text("text") || null } : { reason: text("text") },
  });
  return res.ok ? redirect(`/admin/structures/${params.id}?fait=${intent}`) : fail("badge", res);
}

export default function AdminStructure({ loaderData, actionData }: Route.ComponentProps) {
  const { structure: s, done } = loaderData;
  const busy = useNavigation().state !== "idle";
  const result = actionData as Result | undefined;
  const others = s.documents.filter((d) => d.kind === "other");
  return (
    <>
      <div className="orga__head">
        <div>
          <a className="o-t-caption" href="/admin/badges">
            ← {L.adminBadgesTitle}
          </a>
          <h1 className="s-title o-never-truncate">{s.name}</h1>
          <div className="s-row">
            <Chip variant={s.verification === "suspended" ? "accent" : undefined}>
              {s.verification === "suspended" && s.suspendedReason
                ? suspensionReasonLabels[s.suspendedReason]
                : structureVerificationLabels[s.verification]}
            </Chip>
            {s.badgeExpiresAt && (
              <span className="o-t-caption s-muted">
                {L.adminDaysLeft(s.daysLeft)} · {L.adminExpiresOn(formatDay(s.badgeExpiresAt))}
              </span>
            )}
          </div>
        </div>
      </div>
      {done && (
        <p className="s-notice s-notice--ok" role="status" data-testid="structure-done">
          {done === "transfer" ? L.transferDone : L.adminDone}
        </p>
      )}

      <section className="orga__panel s-stack" aria-labelledby="badge-title" data-testid="admin-badge">
        <h2 className="s-h2" id="badge-title">
          Badge
        </h2>
        <p className="o-t-caption s-muted">{s.verification === "suspended" ? L.adminLiftHint : L.adminReasonHint}</p>
        <Form method="post" className="s-stack">
          <TextField label={`${L.adminRenewNote} / ${L.adminReason}`} name="text" maxLength={500} autoComplete="off" />
          {result?.section === "badge" && result.error && (
            <p className="s-error" role="alert">
              {result.error}
            </p>
          )}
          <div className="s-row">
            {(s.verification === "verified" || s.suspendedReason === "badge_expired") && (
              <Button type="submit" name="intent" value="renew" variant="secondary" icon="check" loading={busy}>
                {L.adminRenew}
              </Button>
            )}
            {s.verification === "verified" && (
              <Button type="submit" name="intent" value="suspend" variant="secondary" icon="close" loading={busy}>
                {L.adminSuspend}
              </Button>
            )}
            {s.verification === "suspended" && (
              <Button type="submit" name="intent" value="lift" variant="secondary" icon="undo" loading={busy}>
                {L.adminLift}
              </Button>
            )}
          </div>
        </Form>
      </section>

      <section className="orga__panel s-stack" aria-labelledby="team-title">
        <h2 className="s-h2" id="team-title">
          {L.members}
        </h2>
        <ul className="ae-list">
          {s.members.map((m) => (
            <li key={m.userId}>
              <span className="o-never-truncate">{m.pseudo}</span>
              <span className="s-muted">
                {structureRoleLabels[m.role as StructureRole] ?? m.role}
                {m.status === "active" ? "" : ` · ${m.status}`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="orga__panel s-stack" aria-labelledby="transfer-title" data-testid="admin-transfer">
        <h2 className="s-h2" id="transfer-title">
          {L.transferTitle}
        </h2>
        <p className="s-muted">{L.transferIntro}</p>
        <p className="o-t-caption">
          {L.transferOwner} : <strong>{s.owner?.pseudo ?? "—"}</strong>
        </p>

        <div className="s-stack s-stack--tight">
          <h3 className="o-t-label s-label">{L.documents}</h3>
          {s.documents.length === 0 ? (
            <p className="o-t-caption s-muted">{L.transferNoDocument}</p>
          ) : (
            <ul className="ae-list">
              {s.documents.map((d) => (
                <li key={d.id}>
                  <a href={`/api/admin/verification-documents/${d.id}`} target="_blank" rel="noreferrer">
                    {d.fileName}
                  </a>
                  <span className="s-muted">
                    {verificationDocumentKindLabels[d.kind]} · {formatDay(d.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Form method="post" encType="multipart/form-data" className="s-stack">
          <input type="hidden" name="intent" value="document" />
          <FileField
            label={L.transferUpload}
            name="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            help={L.transferUploadHint}
          />
          {result?.section === "document" && result.error && (
            <p className="s-error" role="alert">
              {result.error}
            </p>
          )}
          <div className="s-row">
            <Button type="submit" variant="secondary" icon="export" loading={busy}>
              {L.transferUpload}
            </Button>
          </div>
        </Form>

        <Form method="post" className="s-stack">
          <input type="hidden" name="intent" value="transfer" />
          <TextField label={L.transferNew} name="pseudo" autoComplete="off" required maxLength={40} />
          <TextAreaField label={L.transferReason} name="reason" rows={2} minLength={10} maxLength={500} required />
          <SelectField
            label={L.transferDocument}
            name="documentId"
            defaultValue={others[0]?.id ?? ""}
            options={others.map((d) => ({ value: d.id, label: `${d.fileName} (${formatDay(d.createdAt)})` }))}
          />
          {result?.section === "transfer" && result.error && (
            <p className="s-error" role="alert">
              {result.error}
            </p>
          )}
          <div className="s-row">
            <Button
              type="submit"
              icon="check"
              loading={busy}
              disabled={others.length === 0}
              data-testid="transfer-owner"
            >
              {L.transferButton}
            </Button>
          </div>
        </Form>
      </section>
    </>
  );
}
