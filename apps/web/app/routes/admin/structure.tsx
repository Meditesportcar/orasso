// Administration : fiche d'une structure (lot 27). Badge (renouveler, suspendre, lever) et changement de propriétaire
// sur justificatif, par l'équipe Orasso seulement (docs/01 : « l'équipe peut intervenir à tout moment sur justificatif »).
// Le justificatif est téléversé ici (document « autre », visible de l'équipe seulement) ; tout est au journal.
import { Button, Chip, SelectField, TextField } from "@orasso/design-system/web";
import {
  type AdminStructureDetail,
  type AssistanceState,
  adminTexts,
  assistanceTexts,
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
  // Lot 33 : demande d'aide (mode assistance) et quota des messages groupés aux abonnés (S18).
  const [assistance, registry] = await Promise.all([
    api<AssistanceState>(request, `/structures/${params.id}/assistance`),
    api<{ id: string; slug: string; followerMessageQuota: number | null }[]>(
      request,
      `/admin/structure-registry?q=${encodeURIComponent(structure.name)}`,
    ),
  ]);
  const row = registry.ok ? registry.data.find((r) => r.id === structure.id) : undefined;
  return {
    structure,
    done: new URL(request.url).searchParams.get("fait"),
    assistance: assistance.ok ? assistance.data : null,
    slug: row?.slug ?? structure.slug,
    quota: row?.followerMessageQuota ?? null,
  };
}

type Result = { section: "badge" | "document" | "transfer" | "quota" | "assistance"; error?: string };

export async function action({ request, params }: Route.ActionArgs) {
  await requireSuperAdmin(request);
  const form = await request.formData();
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const intent = text("intent");
  const base = `/admin/structures/${encodeURIComponent(params.id)}`;
  const fail = (section: Result["section"], res: { status: number; error: { message: string } }) =>
    data({ section, error: res.error.message } satisfies Result, { status: res.status });

  if (intent === "quota") {
    const raw = text("quota");
    const res = await api(request, `${base}/quota`, {
      method: "PATCH",
      json: { followerMessageQuota: raw === "" ? null : Number(raw), reason: text("reason") },
    });
    return res.ok ? redirect(`/admin/structures/${params.id}?fait=quota`) : fail("quota", res);
  }
  if (intent === "close-assistance") {
    const res = await api(request, `/admin/assistance-requests/${encodeURIComponent(text("requestId"))}/close`, {
      method: "POST",
    });
    return res.ok ? redirect(`/admin/structures/${params.id}?fait=assistance`) : fail("assistance", res);
  }
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
  const { structure: s, done, assistance, slug, quota } = loaderData;
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

      <section className="orga__panel s-stack" aria-labelledby="assist-title" data-testid="admin-assistance">
        <div className="adm-assist">
          <h2 className="s-h2" id="assist-title">
            {assistanceTexts.current}
          </h2>
          <a href={`/orga/${slug}`}>{assistanceTexts.survey}</a>
        </div>
        {assistance?.current ? (
          <Form method="post" className="s-stack">
            <input type="hidden" name="intent" value="close-assistance" />
            <input type="hidden" name="requestId" value={assistance.current.id} />
            <p>
              {assistance.current.message}
              <br />
              <span className="o-t-caption s-muted">
                {assistance.current.requestedBy?.pseudo ?? "—"} · {formatDay(assistance.current.createdAt)} · jusqu'au{" "}
                {formatDay(assistance.current.expiresAt)} · {assistance.current.interventions} intervention(s)
              </span>
            </p>
            {result?.section === "assistance" && result.error && (
              <p className="s-error" role="alert">
                {result.error}
              </p>
            )}
            <div className="s-row">
              <Button type="submit" variant="secondary" icon="close" loading={busy}>
                {assistanceTexts.close}
              </Button>
            </div>
          </Form>
        ) : (
          <p className="s-muted">{assistanceTexts.readOnlyHint}</p>
        )}
      </section>

      <section className="orga__panel s-stack" aria-labelledby="quota-title" data-testid="admin-quota">
        <h2 className="s-h2" id="quota-title">
          Messages groupés aux abonnés
        </h2>
        <p className="o-t-caption s-muted">
          Nombre de messages par 30 jours (vide = valeur par défaut d'Orasso). Actuel : {quota ?? "par défaut"}.
        </p>
        <Form method="post" className="s-stack">
          <input type="hidden" name="intent" value="quota" />
          <TextField label="Quota" name="quota" type="number" min={0} max={30} defaultValue={quota ?? ""} />
          <TextField label={adminTexts.reasonLabel} name="reason" required minLength={5} />
          {result?.section === "quota" && result.error && (
            <p className="s-error" role="alert">
              {result.error}
            </p>
          )}
          <div className="s-row">
            <Button type="submit" variant="secondary" icon="check" loading={busy}>
              Enregistrer le quota
            </Button>
          </div>
        </Form>
      </section>

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
