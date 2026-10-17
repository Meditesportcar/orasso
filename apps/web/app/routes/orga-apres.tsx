// Après l'événement, côté organisateur (lot 27, docs/01 « Organisateurs : après l'événement », docs/02) : bilan
// automatique, remerciement aux présents (une seule fois, avec le lien d'avis de chacun), export des participants
// (motif obligatoire, tracé) et édition suivante (duplication, puis invitation des retenus).
import { Button, Counters, TextField } from "@orasso/design-system/web";
import {
  type EventOrganizer,
  type EventReportView,
  EXPORT_REASON_MIN,
  eventDaysLabels,
  formatDayDate,
  afterEventLabels as L,
  renderTemplate,
  reviewLink,
  type ThanksResult,
} from "@orasso/shared";
import { useState } from "react";
import { data, Form, redirect, useNavigation } from "react-router";

import { TextAreaField } from "../components/Fields";
import { apiFetch } from "../lib/api.client";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { formatDateTime, formatDay, formatWhen } from "../lib/format";
import type { Route } from "./+types/orga-apres";
import "../styles/after-event.css";

export function meta() {
  return [{ title: "Après l'événement · Orasso" }, { name: "robots", content: "noindex" }];
}

async function organizerOf(request: Request, slug: string) {
  const me = await requireMe(request);
  const membership = me.memberships.find((m) => m.structureSlug === slug && m.status === "active");
  if (!membership || membership.role === "staff") {
    throw new Response("Réservé aux organisateurs de la structure.", { status: 403 });
  }
  return { membership, pseudo: me.profile.pseudo };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { membership, pseudo } = await organizerOf(request, params.structure);
  const event = await apiOrThrow<EventOrganizer>(request, `/events/${params.eventId}`);
  if (event.structure.id !== membership.structureId) throw new Response("Événement introuvable.", { status: 404 });
  const view = await api<EventReportView>(request, `/events/${params.eventId}/report`);
  return { event, view: view.ok ? view.data : null, viewError: view.ok ? null : view.error.message, pseudo };
}

export async function action({ request, params }: Route.ActionArgs) {
  await organizerOf(request, params.structure);
  const res = await api<EventOrganizer>(request, `/events/${params.eventId}/duplicate`, { method: "POST" });
  if (!res.ok) return data({ error: res.error.message }, { status: res.status });
  return redirect(`/orga/${params.structure}/e/${res.data.id}/modifier`);
}

const percent = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)} %`);

function Ranked({ title, items }: { title: string; items: { label: string; count: number }[] }) {
  return (
    <div className="s-stack s-stack--tight">
      <h3 className="o-t-label s-label">{title}</h3>
      {items.length === 0 ? (
        <p className="o-t-caption s-muted">{L.none}</p>
      ) : (
        <ul className="ae-list">
          {items.map((i) => (
            <li key={i.label}>
              <span className="o-never-truncate">{i.label}</span>
              <b className="o-t-number">{i.count}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function OrgaApres({ loaderData, actionData, params }: Route.ComponentProps) {
  const { event, view, viewError, pseudo } = loaderData;
  const busy = useNavigation().state !== "idle";
  const report = view?.report ?? null;
  const d = report?.data;
  const duplicateError = actionData && "error" in actionData ? actionData.error : null;
  const average = d?.reviews.average?.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) ?? null;

  return (
    <div className="s-stack" data-testid="orga-apres">
      <div className="s-stack s-stack--tight">
        <a className="o-t-caption" href={`/orga/${params.structure}/e/${event.id}`}>
          ← {event.title}
        </a>
        <div className="s-label o-t-label">{L.title}</div>
        <h1 className="s-title">{event.title}</h1>
        <div className="o-t-meta s-label">{formatWhen(event.startsAt, event.endsAt)}</div>
      </div>

      {viewError && (
        <p className="s-notice s-notice--alert" role="alert">
          {viewError}
        </p>
      )}

      <section className="orga__panel s-stack" aria-labelledby="ae-report" data-testid="ae-report">
        <h2 className="s-h2" id="ae-report">
          {L.reportTitle}
        </h2>
        {!report || !d ? (
          <p className="s-muted" data-testid="ae-report-empty">
            {Date.parse(event.endsAt) > Date.now() ? L.notEnded : L.notReady}
          </p>
        ) : (
          <>
            <Counters
              variant="surface"
              size="site"
              active={1}
              items={[
                { value: d.accepted, label: L.accepted },
                { value: d.present, label: L.present },
                { value: d.absent, label: L.absent },
                { value: percent(d.presenceRate), label: L.presenceRate },
              ]}
              data-testid="ae-counters"
            />
            <p className="o-t-caption s-muted">
              {report.refreshedAt
                ? L.reportFinal(formatDay(report.refreshedAt))
                : L.reportProvisional(formatDay(view?.refreshAt ?? report.generatedAt))}
            </p>
            {/* Lot 26 : bilan par jour d'un événement sur plusieurs jours. */}
            {d.byDay && d.byDay.length > 1 && (
              <div className="s-table-wrap" data-testid="ae-by-day">
                <table className="s-table">
                  <thead>
                    <tr className="o-t-label">
                      <th scope="col">{eventDaysLabels.day}</th>
                      <th scope="col">{L.accepted}</th>
                      <th scope="col">{L.present}</th>
                      <th scope="col">{L.absent}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.byDay.map((day) => (
                      <tr key={day.dayId}>
                        <td>{formatDayDate(day.date)}</td>
                        <td>{day.accepted}</td>
                        <td>{day.present}</td>
                        <td>{day.absent}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="ae-lists">
              <Ranked title={L.byCategory} items={d.byCategory} />
              <Ranked title={L.byMake} items={d.byMake} />
              <Ranked title={L.byDepartment} items={d.byDepartment} />
            </div>
            <dl className="ae-facts">
              <div>
                <dt className="o-t-label s-label">{L.registered}</dt>
                <dd className="o-t-body">{d.registered}</dd>
              </div>
              <div>
                <dt className="o-t-label s-label">{L.newFollowers}</dt>
                <dd className="o-t-body">{d.newFollowers}</dd>
              </div>
              <div>
                <dt className="o-t-label s-label">{L.providers}</dt>
                <dd className="o-t-body">{L.providersValue(d.providers.present, d.providers.accepted)}</dd>
              </div>
              <div>
                <dt className="o-t-label s-label">{L.staff}</dt>
                <dd className="o-t-body">{L.staffValue(d.staff.present, d.staff.expected)}</dd>
              </div>
              <div>
                <dt className="o-t-label s-label">{L.incidents}</dt>
                <dd className="o-t-body">{d.incidents}</dd>
              </div>
              <div>
                <dt className="o-t-label s-label">{L.reviews}</dt>
                <dd className="o-t-body">{L.reviewsValue(d.reviews.count, average)}</dd>
              </div>
              <div>
                <dt className="o-t-label s-label">{L.scans}</dt>
                <dd className="o-t-body">{L.scansValue(d.scans.total, d.scans.duplicates, d.scans.overrides)}</dd>
              </div>
              <div>
                <dt className="o-t-label s-label">{L.points}</dt>
                <dd className="o-t-body">{L.pointsValue(d.points.participations, d.points.malus)}</dd>
              </div>
            </dl>
          </>
        )}
      </section>

      {view && <Thanks eventId={event.id} view={view} event={event} pseudo={pseudo} />}
      {view && <Export eventId={event.id} />}

      <section className="orga__panel s-stack" aria-labelledby="ae-next" data-testid="ae-next">
        <h2 className="s-h2" id="ae-next">
          {L.nextTitle}
        </h2>
        <p className="s-muted">{L.nextIntro}</p>
        {duplicateError && (
          <p className="s-error" role="alert">
            {duplicateError}
          </p>
        )}
        <Form method="post" className="s-row">
          <Button type="submit" variant="secondary" icon="add" loading={busy} data-testid="ae-duplicate">
            {L.nextDuplicate}
          </Button>
        </Form>
        <p className="o-t-caption s-muted">{L.nextInviteHint}</p>
      </section>
    </div>
  );
}

function Thanks({
  eventId,
  view,
  event,
  pseudo,
}: {
  eventId: string;
  view: EventReportView;
  event: EventOrganizer;
  pseudo: string;
}) {
  const thanks = view.thanks;
  const [body, setBody] = useState(thanks.template.body);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState(thanks.sentAt);
  const blocked = sentAt ? "sent" : thanks.blockedReason;
  const noOne = thanks.recipients === 0;

  const preview = renderTemplate(body, {
    pseudo,
    "structure.name": event.structure.name,
    "event.title": event.title,
    "event.date": formatDateTime(event.startsAt),
    "event.city": event.city,
    review_link: reviewLink(typeof window === "undefined" ? "" : window.location.origin, "<ton lien personnel>"),
  });

  async function send() {
    setBusy(true);
    setError(null);
    const res = await apiFetch<ThanksResult>(`/events/${eventId}/thanks`, {
      method: "POST",
      json: body === thanks.template.body ? {} : { body },
    });
    setBusy(false);
    setConfirming(false);
    if (!res.ok) return setError(res.error.message);
    setSentAt(res.data.sentAt);
  }

  return (
    <section className="orga__panel s-stack" aria-labelledby="ae-thanks" data-testid="ae-thanks">
      <h2 className="s-h2" id="ae-thanks">
        {L.thanksTitle}
      </h2>
      <p className="s-muted">{L.thanksIntro}</p>
      {sentAt ? (
        <p className="s-notice s-notice--ok" role="status" data-testid="ae-thanks-sent">
          {L.thanksSent(formatDateTime(sentAt))}
        </p>
      ) : blocked ? (
        <p className="s-notice" data-testid="ae-thanks-blocked">
          {L.thanksBlocked[blocked]}
        </p>
      ) : noOne ? (
        <p className="s-notice">{L.thanksNoPresent}</p>
      ) : (
        <>
          <TextAreaField
            label={L.thanksBody}
            name="body"
            rows={6}
            maxLength={2000}
            value={body}
            onChange={(e) => setBody(e.currentTarget.value)}
            help={L.thanksEmail}
          />
          <div className="s-stack s-stack--tight">
            <span className="o-t-label s-label">{L.thanksPreview}</span>
            <p className="ae-preview o-t-body" data-testid="ae-thanks-preview">
              {preview}
            </p>
          </div>
          <p className="o-t-caption s-muted">{L.thanksRecipients(thanks.recipients)}</p>
          {error && (
            <p className="s-error" role="alert">
              {error}
            </p>
          )}
          {confirming ? (
            <div className="s-stack s-stack--tight">
              <p role="status">{L.thanksConfirm(thanks.recipients)}</p>
              <div className="s-row">
                <Button icon="check" loading={busy} onClick={() => void send()} data-testid="ae-thanks-confirm">
                  {L.thanksSend}
                </Button>
                <Button variant="secondary" icon="close" disabled={busy} onClick={() => setConfirming(false)}>
                  Annuler
                </Button>
              </div>
            </div>
          ) : (
            <div className="s-row">
              <Button
                icon="share"
                onClick={() => setConfirming(true)}
                disabled={!body.trim()}
                data-testid="ae-thanks-send"
              >
                {L.thanksSend}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Export({ eventId }: { eventId: string }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function download() {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch(`/api/events/${eventId}/participants/export`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
        credentials: "same-origin",
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(payload?.error?.message ?? "Export impossible.");
        return;
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "participants.csv";
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
      setDone(true);
      setReason("");
    } catch {
      setError("Connexion impossible. Réessaie.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="orga__panel s-stack" aria-labelledby="ae-export" data-testid="ae-export">
      <h2 className="s-h2" id="ae-export">
        {L.exportTitle}
      </h2>
      <p className="s-muted">{L.exportIntro}</p>
      <form
        className="s-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void download();
        }}
      >
        <TextField
          label={L.exportReason}
          name="reason"
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
          help={L.exportReasonHint}
          maxLength={300}
          autoComplete="off"
        />
        <p className="o-t-caption s-muted">
          {L.exportTrace} {L.exportNotes}
        </p>
        {error && (
          <p className="s-error" role="alert">
            {error}
          </p>
        )}
        {done && (
          <p className="s-notice s-notice--ok" role="status" data-testid="ae-export-done">
            {L.exportDone}
          </p>
        )}
        <div className="s-row">
          <Button
            type="submit"
            variant="secondary"
            icon="export"
            loading={busy}
            disabled={reason.trim().length < EXPORT_REASON_MIN}
            data-testid="ae-export-button"
          >
            {L.exportButton}
          </Button>
        </div>
      </form>
    </section>
  );
}
