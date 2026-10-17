// Administration (lot 33) : newsletter Orasso. Rédaction en Markdown réduit avec aperçu, envoi d'un test à soi-même,
// planification, historique. L'envoi part par lots aux seules personnes qui l'ont acceptée (adresse confirmée), avec un
// lien de désinscription dans chaque e-mail.
import { Button, Chip, TextField } from "@orasso/design-system/web";
import {
  markdownToHtml,
  type NewsletterAudience,
  type NewsletterView,
  newsletterStatusLabels,
  newsletterTexts,
} from "@orasso/shared";
import { useState } from "react";
import { data, Form, redirect, useNavigation } from "react-router";

import { TextAreaField } from "../../components/Fields";
import { requireSuperAdmin } from "../../lib/admin.server";
import { api, apiOrThrow } from "../../lib/api.server";
import { fromInput, toInput } from "../../lib/datetime";
import { formatDateTime } from "../../lib/format";
import type { Route } from "./+types/newsletter";

export function meta() {
  return [{ title: "Newsletter · Administration · Orasso" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireSuperAdmin(request);
  const url = new URL(request.url);
  const [list, audience] = await Promise.all([
    apiOrThrow<NewsletterView[]>(request, "/admin/newsletters"),
    apiOrThrow<NewsletterAudience>(request, "/admin/newsletters/audience"),
  ]);
  const id = url.searchParams.get("id");
  const current = id ? (list.find((n) => n.id === id) ?? null) : null;
  return { list, audience, current, done: url.searchParams.get("fait") };
}

export async function action({ request }: Route.ActionArgs) {
  await requireSuperAdmin(request);
  const form = await request.formData();
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const intent = text("intent");
  const id = text("id");
  const draft = { subject: text("subject"), bodyMd: String(form.get("bodyMd") ?? "") };
  const fail = (res: { status: number; error: { message: string } }) =>
    data({ error: res.error.message }, { status: res.status });
  if (intent === "save") {
    const res = id
      ? await api<NewsletterView>(request, `/admin/newsletters/${id}`, { method: "PUT", json: draft })
      : await api<NewsletterView>(request, "/admin/newsletters", { method: "POST", json: draft });
    return res.ok ? redirect(`/admin/newsletter?id=${res.data.id}&fait=enregistree`) : fail(res);
  }
  if (!id) return data({ error: "Enregistre d'abord le brouillon." }, { status: 400 });
  if (intent === "test") {
    const saved = await api(request, `/admin/newsletters/${id}`, { method: "PUT", json: draft });
    if (!saved.ok) return fail(saved);
    const res = await api(request, `/admin/newsletters/${id}/test`, { method: "POST" });
    return res.ok ? redirect(`/admin/newsletter?id=${id}&fait=test`) : fail(res);
  }
  if (intent === "schedule") {
    const at = fromInput(text("at")) ?? new Date().toISOString();
    const saved = await api(request, `/admin/newsletters/${id}`, { method: "PUT", json: draft });
    if (!saved.ok) return fail(saved);
    const res = await api(request, `/admin/newsletters/${id}/schedule`, { method: "POST", json: { at } });
    return res.ok ? redirect(`/admin/newsletter?id=${id}&fait=planifiee`) : fail(res);
  }
  if (intent === "unschedule") {
    const res = await api(request, `/admin/newsletters/${id}/unschedule`, { method: "POST" });
    return res.ok ? redirect(`/admin/newsletter?id=${id}`) : fail(res);
  }
  if (intent === "delete") {
    const res = await api(request, `/admin/newsletters/${id}`, { method: "DELETE" });
    return res.ok ? redirect("/admin/newsletter") : fail(res);
  }
  return data({ error: "Action inconnue." }, { status: 400 });
}

const DONE: Record<string, string> = {
  enregistree: "Brouillon enregistré.",
  test: "Test envoyé à ton adresse.",
  planifiee: "Envoi planifié : il part par lots à l'heure choisie.",
};

export default function AdminNewsletter({ loaderData, actionData }: Route.ComponentProps) {
  const { list, audience, current, done } = loaderData;
  const busy = useNavigation().state !== "idle";
  const [body, setBody] = useState(current?.bodyMd ?? "");
  const editable = !current || current.status === "draft" || current.status === "scheduled";
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Administration</div>
          <h1 className="s-title">{newsletterTexts.title}</h1>
          <p className="s-muted">
            {newsletterTexts.hint} {newsletterTexts.recipients(audience.recipients)}.
          </p>
        </div>
        <a href="/admin/newsletter">Nouvelle newsletter</a>
      </div>
      {done && DONE[done] && (
        <p className="s-notice s-notice--ok" role="status" data-testid="newsletter-done">
          {DONE[done]}
        </p>
      )}
      {actionData?.error && (
        <p className="s-error" role="alert">
          {actionData.error}
        </p>
      )}

      <Form method="post" className="orga__panel s-stack" data-testid="newsletter-editor" key={current?.id ?? "new"}>
        <input type="hidden" name="id" value={current?.id ?? ""} />
        {current && (
          <div className="s-row">
            <Chip>{newsletterStatusLabels[current.status]}</Chip>
            {current.scheduledAt && (
              <span className="o-t-caption">Planifiée le {formatDateTime(current.scheduledAt)}</span>
            )}
          </div>
        )}
        <TextField label="Objet" name="subject" defaultValue={current?.subject ?? ""} required readOnly={!editable} />
        <TextAreaField
          label="Message"
          name="bodyMd"
          rows={12}
          value={body}
          onChange={(e) => setBody(e.currentTarget.value)}
          help={newsletterTexts.markdownHelp}
          readOnly={!editable}
          required
        />
        <div className="s-stack s-stack--tight">
          <span className="o-t-label">{newsletterTexts.preview}</span>
          {/* Aperçu : le Markdown est échappé avant la mise en forme (aucun HTML saisi ne passe). */}
          <div
            className="adm-preview"
            data-testid="newsletter-preview"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML produit par markdownToHtml, tout le texte est échappé
            dangerouslySetInnerHTML={{ __html: markdownToHtml(body) }}
          />
        </div>
        {editable && (
          <>
            <div className="s-row">
              <Button type="submit" name="intent" value="save" variant="secondary" icon="check" loading={busy}>
                {newsletterTexts.save}
              </Button>
              {current && (
                <Button type="submit" name="intent" value="test" variant="secondary" icon="inbox" loading={busy}>
                  {newsletterTexts.test}
                </Button>
              )}
            </div>
            {current && (
              <div className="adm-search">
                <TextField
                  label="Envoi le"
                  name="at"
                  type="datetime-local"
                  defaultValue={toInput(current.scheduledAt ?? new Date())}
                />
                <Button type="submit" name="intent" value="schedule" icon="calendar" loading={busy}>
                  {newsletterTexts.schedule}
                </Button>
                {current.status === "scheduled" && (
                  <Button type="submit" name="intent" value="unschedule" variant="secondary" icon="undo" loading={busy}>
                    Revenir au brouillon
                  </Button>
                )}
                {current.status === "draft" && (
                  <Button type="submit" name="intent" value="delete" variant="secondary" icon="close" loading={busy}>
                    Supprimer le brouillon
                  </Button>
                )}
              </div>
            )}
          </>
        )}
        {current && !editable && (
          <p className="o-t-caption" data-testid="newsletter-progress">
            {current.status === "sent"
              ? `Envoyée le ${formatDateTime(current.sentAt ?? current.updatedAt)} à ${current.recipientsCount} personnes.`
              : `Envoi en cours : ${current.delivered} e-mails partis.`}
          </p>
        )}
      </Form>

      <section className="orga__panel s-stack" aria-labelledby="history">
        <h2 id="history" className="s-h2">
          Historique
        </h2>
        {list.length === 0 ? (
          <p className="s-muted">Aucune newsletter pour l'instant.</p>
        ) : (
          <ul className="adm-list" data-testid="newsletter-history">
            {list.map((n) => (
              <li key={n.id}>
                <a href={`/admin/newsletter?id=${n.id}`} aria-current={current?.id === n.id ? "true" : undefined}>
                  {n.subject} · {newsletterStatusLabels[n.status]}
                  {n.status === "sent" ? ` · ${n.recipientsCount} destinataires` : ""}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
