// Administration : file des signalements (lot 32, ARCHITECTURE-SUITE § 15.3). Modérateur et super admin, double
// authentification de session (vérifiée par l'API). Le modérateur prend en charge, clôt sans suite ou suspend 7 jours ;
// le super admin décide (échelle complète, retrait du contenu, rejet pour abus). Chaque ouverture d'un signalement est
// tracée par l'API (seul accès de l'équipe à une conversation privée : la copie jointe au signalement).
import { Button, Chip, Plate, SelectField } from "@orasso/design-system/web";
import {
  type AdminReportDetail,
  type AdminReportItem,
  moderationLabels,
  type Page,
  type ReportStatus,
  reportReasonLabels,
  reportStatuses,
  reportStatusLabels,
  reportTargetLabels,
  sanctionKindLabels,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { TextAreaField } from "../../components/Fields";
import { requireModeration } from "../../lib/admin.server";
import { api, apiOrThrow } from "../../lib/api.server";
import { formatDateTime } from "../../lib/format";
import type { Route } from "./+types/signalements";
import "../../styles/moderation.css";

export function meta() {
  return [{ title: "Signalements · Administration · Orasso" }, { name: "robots", content: "noindex, nofollow" }];
}

const isStatus = (s: string | null): s is ReportStatus =>
  Boolean(s && (reportStatuses as readonly string[]).includes(s));

export async function loader({ request }: Route.LoaderArgs) {
  await requireModeration(request);
  const url = new URL(request.url);
  const statut = url.searchParams.get("statut");
  const status: ReportStatus = isStatus(statut) ? statut : "pending";
  const id = url.searchParams.get("id");
  const [list, detail] = await Promise.all([
    apiOrThrow<Page<AdminReportItem>>(request, `/admin/reports?status=${status}`),
    id && /^[0-9a-f-]{36}$/.test(id)
      ? apiOrThrow<AdminReportDetail>(request, `/admin/reports/${id}`)
      : Promise.resolve(null),
  ]);
  return { status, list: list.items, detail };
}

export async function action({ request }: Route.ActionArgs) {
  await requireModeration(request);
  const form = await request.formData();
  const id = String(form.get("reportId") ?? "");
  const intent = String(form.get("intent") ?? "");
  const note = String(form.get("note") ?? "").trim() || null;
  const back = String(form.get("back") ?? "/admin/signalements");
  let res: Awaited<ReturnType<typeof api>>;
  if (intent === "status") {
    res = await api(request, `/admin/reports/${encodeURIComponent(id)}/status`, {
      method: "POST",
      json: { status: String(form.get("status")), note },
    });
  } else if (intent === "sanction") {
    const kind = String(form.get("kind") ?? "");
    res = await api(request, `/admin/reports/${encodeURIComponent(id)}/sanction`, {
      method: "POST",
      json: {
        kind: kind || null,
        note,
        hideContent: form.get("hideContent") === "on",
        subject: form.get("subject") === "reporter" ? "reporter" : "owner",
      },
    });
  } else if (intent === "lift") {
    res = await api(request, `/admin/sanctions/${encodeURIComponent(String(form.get("sanctionId") ?? ""))}/lift`, {
      method: "POST",
      json: { note },
    });
  } else {
    return data({ error: "Action inconnue." }, { status: 400 });
  }
  if (!res.ok) return data({ error: res.error.message }, { status: res.status });
  return redirect(back.startsWith("/admin/signalements") ? back : "/admin/signalements");
}

function Detail({ d, back, busy, error }: { d: AdminReportDetail; back: string; busy: boolean; error?: string }) {
  const sanctionOptions = d.can.sanctionKinds.map((k) => ({ value: k, label: sanctionKindLabels[k] }));
  return (
    <section className="orga__panel s-stack" aria-labelledby="report-title" data-testid="report-detail">
      <div className="s-row s-row--between">
        <div className="s-stack s-stack--tight">
          <div className="s-label o-t-label">
            {reportTargetLabels[d.targetType]} · {formatDateTime(d.createdAt)}
          </div>
          <h2 id="report-title" className="s-h2 o-never-truncate">
            {d.target.title}
          </h2>
        </div>
        <Chip variant={d.status === "pending" ? "accent" : undefined}>{reportStatusLabels[d.status]}</Chip>
      </div>
      {d.target.gone && <p className="s-notice">{moderationLabels.targetGone}</p>}
      {d.target.removed && <p className="s-notice">{moderationLabels.targetRemoved}</p>}
      {/* Lot R5c1, tour 2 : toutes les photos d'une publication de crew signalée. */}
      {(d.target.imageUrls ?? (d.target.imageUrl ? [d.target.imageUrl] : [])).map((url) => (
        <img key={url} className="mod-target__img" src={url} alt="" />
      ))}
      {d.target.text && d.targetType !== "message" && <p className="s-prewrap">{d.target.text}</p>}
      {d.target.link && (
        <a href={d.target.link} target="_blank" rel="noopener">
          Ouvrir la page
        </a>
      )}
      <dl className="s-recap">
        <dt>{moderationLabels.reason}</dt>
        <dd>{reportReasonLabels[d.reason]}</dd>
        {d.details && (
          <>
            <dt>{moderationLabels.details}</dt>
            <dd className="s-prewrap">{d.details}</dd>
          </>
        )}
        <dt>Compte visé</dt>
        <dd>
          {d.ownerPseudo ?? "—"}
          {d.ownerSuspended ? " · suspendu" : ""} · {d.openOnOwner} signaleur(s) en 24 h
        </dd>
        <dt>{moderationLabels.reporterLabel}</dt>
        <dd data-testid="report-reporter">
          {d.reporter.pseudo} · compte de {d.reporter.accountAgeDays} jours · {d.reporter.dismissedAbusive} rejet(s)
          pour abus
        </dd>
        {d.handledByPseudo && (
          <>
            <dt>Traité par</dt>
            <dd>
              {d.handledByPseudo}
              {d.handledAt ? ` · ${formatDateTime(d.handledAt)}` : ""}
            </dd>
          </>
        )}
      </dl>
      {d.context && (
        <section className="s-stack" aria-labelledby="ctx-title" data-testid="report-context">
          <h3 id="ctx-title" className="s-label o-t-label">
            {moderationLabels.contextTitle}
          </h3>
          <ol className="mod-context">
            {d.context.map((m) => (
              <li key={m.id} className={`mod-context__item${m.reported ? " mod-context__item--reported" : ""}`}>
                <span className="o-t-caption">
                  {m.pseudo} · {formatDateTime(m.createdAt)}
                  {m.reported ? " · message signalé" : ""}
                </span>
                <p className="s-prewrap">{m.body ?? (m.note === "image" ? "[photo]" : "[message supprimé]")}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
      {d.screenshotUrl && (
        <figure className="s-stack s-stack--tight">
          <figcaption className="s-label o-t-label">{moderationLabels.screenshot}</figcaption>
          <img className="mod-shot" src={d.screenshotUrl} alt="Capture jointe au signalement" />
        </figure>
      )}
      {d.sanction && (
        <Plate className="s-stack s-stack--tight" data-testid="report-sanction">
          <p>
            {sanctionKindLabels[d.sanction.kind]}
            {d.sanction.auto ? ` · ${moderationLabels.autoSanction}` : ""}
            {d.sanction.liftedAt ? ` · ${moderationLabels.sanctionLifted(formatDateTime(d.sanction.liftedAt))}` : ""}
          </p>
          {d.sanction.liftable && (
            <Form method="post">
              <input type="hidden" name="intent" value="lift" />
              <input type="hidden" name="reportId" value={d.id} />
              <input type="hidden" name="sanctionId" value={d.sanction.id} />
              <input type="hidden" name="back" value={back} />
              <Button type="submit" variant="secondary" icon="undo" loading={busy}>
                {moderationLabels.lift}
              </Button>
            </Form>
          )}
        </Plate>
      )}
      {error && (
        <p className="s-error" role="alert">
          {error}
        </p>
      )}
      {(d.can.review || d.can.closeNoAction || d.can.resolveAction || d.can.dismissAbusive) && (
        <Form method="post" className="s-stack">
          <input type="hidden" name="intent" value="status" />
          <input type="hidden" name="reportId" value={d.id} />
          <input type="hidden" name="back" value={back} />
          <TextAreaField label="Note (journal d'administration)" name="note" rows={2} />
          <div className="s-row">
            {d.can.review && (
              <Button type="submit" name="status" value="reviewing" variant="secondary" icon="wait" loading={busy}>
                {moderationLabels.markReviewing}
              </Button>
            )}
            {d.can.closeNoAction && (
              <Button
                type="submit"
                name="status"
                value="resolved_no_action"
                variant="secondary"
                icon="close"
                loading={busy}
              >
                {moderationLabels.closeNoAction}
              </Button>
            )}
            {d.can.resolveAction && (
              <Button
                type="submit"
                name="status"
                value="resolved_action"
                variant="secondary"
                icon="check"
                loading={busy}
              >
                {moderationLabels.resolveAction}
              </Button>
            )}
            {d.can.dismissAbusive && (
              <Button
                type="submit"
                name="status"
                value="dismissed_abusive"
                variant="secondary"
                icon="undo"
                loading={busy}
              >
                {moderationLabels.dismissAbusive}
              </Button>
            )}
          </div>
        </Form>
      )}
      {(sanctionOptions.length > 0 || d.can.hideContent) && (
        <Form method="post" className="s-stack" data-testid="sanction-form">
          <input type="hidden" name="intent" value="sanction" />
          <input type="hidden" name="reportId" value={d.id} />
          <input type="hidden" name="back" value={back} />
          {sanctionOptions.length > 0 && (
            <SelectField
              label="Sanction"
              name="kind"
              options={sanctionOptions}
              placeholder={d.can.hideContent ? moderationLabels.noSanction : undefined}
              defaultValue={d.can.hideContent ? "" : sanctionOptions[0]?.value}
            />
          )}
          {d.can.hideContent && (
            <label className="s-row">
              <input type="checkbox" name="hideContent" />
              <span>{moderationLabels.hideContent}</span>
            </label>
          )}
          <TextAreaField label={moderationLabels.decisionNote} name="note" rows={2} />
          <div className="s-row">
            <Button type="submit" variant="secondary" icon="check" loading={busy} data-testid="sanction-submit">
              {moderationLabels.sanctionSubmit}
            </Button>
          </div>
        </Form>
      )}
      {d.can.sanctionReporter && (
        <Form method="post" className="s-stack">
          <input type="hidden" name="intent" value="sanction" />
          <input type="hidden" name="subject" value="reporter" />
          <input type="hidden" name="reportId" value={d.id} />
          <input type="hidden" name="back" value={back} />
          <SelectField
            label={moderationLabels.sanctionReporter}
            name="kind"
            options={(["warning", "suspension_7d", "suspension_30d", "ban"] as const).map((k) => ({
              value: k,
              label: sanctionKindLabels[k],
            }))}
            defaultValue="warning"
          />
          <TextAreaField label={moderationLabels.decisionNote} name="note" rows={2} />
          <div className="s-row">
            <Button type="submit" variant="secondary" icon="check" loading={busy}>
              {moderationLabels.sanctionReporter}
            </Button>
          </div>
        </Form>
      )}
    </section>
  );
}

export default function AdminReports({ loaderData, actionData }: Route.ComponentProps) {
  const { status, list, detail } = loaderData;
  const busy = useNavigation().state !== "idle";
  const back = `/admin/signalements?statut=${status}${detail ? `&id=${detail.id}` : ""}`;
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Modération</div>
          <h1 className="s-title">{moderationLabels.queueTitle}</h1>
        </div>
      </div>
      <nav className="mod-tabs" aria-label="Statut des signalements">
        {reportStatuses.map((s) => (
          <a
            key={s}
            href={`/admin/signalements?statut=${s}`}
            className={s === status ? "orga__link is-on" : "orga__link"}
            aria-current={s === status ? "page" : undefined}
          >
            {reportStatusLabels[s]}
          </a>
        ))}
      </nav>
      {list.length === 0 ? (
        <p className="s-notice" data-testid="reports-empty">
          {moderationLabels.queueEmpty}
        </p>
      ) : (
        <ul className="mod-queue" data-testid="reports">
          {list.map((r) => (
            <li key={r.id}>
              <a
                className="s-card s-cardlink"
                href={`/admin/signalements?statut=${status}&id=${r.id}`}
                aria-current={detail?.id === r.id ? "true" : undefined}
                data-testid="report-item"
              >
                <span className="s-row s-row--between">
                  <strong>
                    {reportTargetLabels[r.targetType]} · {reportReasonLabels[r.reason]}
                  </strong>
                  <span className="o-t-caption s-muted">{formatDateTime(r.createdAt)}</span>
                </span>
                <span className="o-t-caption">
                  {r.ownerPseudo ?? "—"}
                  {r.ownerSuspended ? " · suspendu" : ""} · {r.openOnOwner} signaleur(s) en 24 h
                  {r.hasScreenshot ? " · capture" : ""}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {detail && (
        <Detail
          d={detail}
          back={back}
          busy={busy}
          error={actionData && "error" in actionData ? actionData.error : undefined}
        />
      )}
    </>
  );
}
