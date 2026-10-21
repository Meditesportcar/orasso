// Presse d'un événement, espace organisateur du site (lot 57, parité de l'API du lot 45 et du tri de l'appli du lot 52,
// segment « Presse ») : réglages de l'accréditation (ouverte, quota, date limite, zones, consignes, contact), demandes
// des médias avec « Accréditer » ou « Refuser » (raison obligatoire, lue par le média), badge presse délivré, contenus
// publiés par les médias avec « Mettre en avant ». Pas de liste d'attente pour la presse ; le quota et les autres règles
// sont ceux de l'API (son message s'affiche tel quel).
import { Button, CheckboxField, Chip, ChipRow, TextField } from "@orasso/design-system/web";
import {
  type AccreditationForOrganizer,
  applicationStatusLabels,
  type EventOrganizer,
  orgaPressLabels as L,
  mediaAppLabels,
  mediaFormatLabels,
  mediaLabels,
  orgaV2Labels,
  type PressSettingsView,
} from "@orasso/shared";
import { data, Form, useNavigation } from "react-router";

import { TextAreaField } from "../components/Fields";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { fromInput, toInput } from "../lib/datetime";
import { formatDay, formatWhen } from "../lib/format";
import "../styles/media.css";
import type { Route } from "./+types/orga-presse";

export function meta() {
  return [{ title: "Presse · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const membership = me.memberships.find((m) => m.structureSlug === params.structure && m.status === "active");
  if (!membership || membership.role === "staff") {
    throw new Response("Réservé à l'organisation de l'événement.", { status: 403 });
  }
  const id = encodeURIComponent(params.eventId);
  const [event, settings, requests] = await Promise.all([
    apiOrThrow<EventOrganizer>(request, `/events/${id}`),
    apiOrThrow<PressSettingsView>(request, `/events/${id}/press-settings`),
    apiOrThrow<AccreditationForOrganizer[]>(request, `/events/${id}/accreditations`),
  ]);
  return {
    event: { id: event.id, title: event.title, startsAt: event.startsAt, endsAt: event.endsAt },
    settings,
    requests,
  };
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export async function action({ request, params }: Route.ActionArgs) {
  await requireMe(request);
  const form = await request.formData();
  const intent = text(form, "intent");
  const eventId = encodeURIComponent(params.eventId);
  const fail = (res: { status: number; error: { message: string } }, id?: string) =>
    data({ error: res.error.message, ok: null, id: id ?? null }, { status: res.status });

  if (intent === "settings") {
    const quota = Number(text(form, "quota"));
    const deadline = text(form, "deadline");
    const res = await api(request, `/events/${eventId}/press-settings`, {
      method: "PUT",
      json: {
        accreditationOpen: form.get("accreditationOpen") === "on",
        quota: quota > 0 ? quota : null,
        deadline: deadline ? fromInput(deadline) : null,
        zones: text(form, "zones") || null,
        instructions: text(form, "instructions") || null,
        contact: text(form, "contact") || null,
      },
    });
    return res.ok ? data({ error: null, ok: L.saved, id: null }) : fail(res);
  }
  if (intent === "accept" || intent === "refuse") {
    const appId = text(form, "applicationId");
    const note = text(form, "note");
    if (intent === "refuse" && !note) {
      return data({ error: L.refuseReasonHelp, ok: null, id: appId }, { status: 400 });
    }
    const res = await api(request, `/events/${eventId}/applications/${encodeURIComponent(appId)}/decide`, {
      method: "POST",
      json:
        intent === "accept"
          ? { decision: "accept" }
          : { decision: "refuse", reasons: ["other"], note, sendReasons: true },
    });
    return res.ok
      ? data({ error: null, ok: intent === "accept" ? L.accepted : L.refused, id: appId })
      : fail(res, appId);
  }
  if (intent === "feature") {
    const featured = text(form, "featured") === "true";
    const res = await api(
      request,
      `/events/${eventId}/media-contents/${encodeURIComponent(text(form, "contentId"))}/feature`,
      { method: "PATCH", json: { featured } },
    );
    return res.ok ? data({ error: null, ok: featured ? L.featured : L.unfeatured, id: null }) : fail(res);
  }
  return data({ error: "Action inconnue.", ok: null, id: null }, { status: 400 });
}

export default function OrgaPresse({ loaderData, actionData }: Route.ComponentProps) {
  const { event, settings: s, requests } = loaderData;
  const busy = useNavigation().state !== "idle";
  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");
  const contents = requests.flatMap((r) => r.contents);
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">{event.title}</div>
          <h1 className="s-title">{L.title}</h1>
          <div className="o-t-meta s-label">{formatWhen(event.startsAt, event.endsAt)}</div>
        </div>
        <Chip surface="plate" data-testid="press-counts">
          {L.counts(s.counts.pending, s.counts.accepted)}
        </Chip>
      </div>
      <p className="s-muted">{L.intro}</p>
      {actionData?.ok && (
        <p className="s-notice s-notice--ok" role="status" data-testid="press-ok">
          {actionData.ok}
        </p>
      )}
      {actionData?.error && !actionData.id && (
        <p className="s-error" role="alert" data-testid="press-error">
          {actionData.error}
        </p>
      )}

      <section className="orga__panel s-stack" aria-labelledby="press-settings" data-testid="press-settings">
        <h2 id="press-settings" className="s-h2">
          {L.settingsTitle}
        </h2>
        <Form method="post" className="s-form">
          <input type="hidden" name="intent" value="settings" />
          <CheckboxField name="accreditationOpen" label={L.open} defaultChecked={s.accreditationOpen} />
          <div className="s-two">
            <TextField
              label={L.quota}
              name="quota"
              type="number"
              min={1}
              max={500}
              defaultValue={s.quota ?? ""}
              help={L.quotaHelp}
            />
            <TextField
              label={L.deadline}
              name="deadline"
              type="datetime-local"
              defaultValue={s.deadline ? toInput(s.deadline) : ""}
              help={L.deadlineHelp}
            />
          </div>
          <TextField label={L.zones} name="zones" defaultValue={s.zones ?? ""} maxLength={500} help={L.zonesHelp} />
          <TextAreaField
            label={L.instructions}
            name="instructions"
            defaultValue={s.instructions ?? ""}
            maxLength={1000}
            rows={3}
          />
          <TextField label={L.contact} name="contact" defaultValue={s.contact ?? ""} maxLength={200} />
          <div>
            <Button type="submit" icon="check" loading={busy}>
              {L.save}
            </Button>
          </div>
        </Form>
      </section>

      <section className="s-stack" aria-labelledby="press-requests" data-testid="press-requests">
        <h2 id="press-requests" className="s-h2">
          {L.requestsTitle} · {pending.length}
        </h2>
        {pending.length === 0 && <p className="s-muted">{orgaV2Labels.pressEmpty}</p>}
        {pending.map((r) => (
          <article key={r.id} className="orga__panel s-stack s-stack--tight" data-testid="press-request">
            <div className="s-row s-row--between">
              <h3 className="s-h2 o-never-truncate">
                <a href={`/m/${r.media.id}`}>{r.media.name}</a>
              </h3>
              {r.media.verified && <Chip variant="verified">{mediaAppLabels.profileVerified}</Chip>}
            </div>
            <ChipRow className="s-chips-wrap">
              {r.formats.map((f) => (
                <Chip key={f}>{mediaFormatLabels[f]}</Chip>
              ))}
            </ChipRow>
            <p className="o-t-caption s-muted">{mediaLabels.requestSent(formatDay(r.createdAt))}</p>
            {r.message && <p>« {r.message} »</p>}
            {actionData?.error && actionData.id === r.id && (
              <p className="s-error" role="alert">
                {actionData.error}
              </p>
            )}
            <div className="md-decide">
              <Form method="post">
                <input type="hidden" name="intent" value="accept" />
                <input type="hidden" name="applicationId" value={r.id} />
                <Button type="submit" variant="secondary" icon="check" loading={busy} data-testid="press-accept">
                  {orgaV2Labels.pressAccept}
                </Button>
              </Form>
              <details>
                <summary className="o-t-label">{orgaV2Labels.pressRefuse}</summary>
                <Form method="post" className="s-form">
                  <input type="hidden" name="intent" value="refuse" />
                  <input type="hidden" name="applicationId" value={r.id} />
                  <TextField label={L.refuseReason} name="note" required maxLength={500} help={L.refuseReasonHelp} />
                  <Button type="submit" variant="secondary" icon="close" loading={busy} data-testid="press-refuse">
                    {L.refuseConfirm}
                  </Button>
                </Form>
              </details>
            </div>
          </article>
        ))}
        {decided.length > 0 && <h3 className="o-t-label">{orgaV2Labels.pressTitle}</h3>}
        {decided.map((r) => (
          <div
            key={r.id}
            className="orga__panel s-row s-row--between"
            data-testid="press-decided"
            data-status={r.status}
          >
            <div className="s-stack s-stack--tight">
              <a href={`/m/${r.media.id}`} className="o-never-truncate">
                <strong>{r.media.name}</strong>
              </a>
              {r.status === "refused" && r.refusalNote && <span className="o-t-caption">{r.refusalNote}</span>}
              {r.status === "accepted" && <span className="o-t-caption">{L.badgeIssued}</span>}
            </div>
            <Chip variant={r.status === "accepted" ? "accent" : "default"}>
              {r.status === "accepted"
                ? orgaV2Labels.pressAccepted
                : r.status === "refused"
                  ? orgaV2Labels.pressRefused
                  : applicationStatusLabels[r.status]}
            </Chip>
          </div>
        ))}
      </section>

      <section className="s-stack" aria-labelledby="press-contents" data-testid="press-contents">
        <h2 id="press-contents" className="s-h2">
          {L.contentsTitle} · {contents.length}
        </h2>
        {contents.length === 0 && <p className="s-muted">{L.contentsNone}</p>}
        {contents.map((c) => (
          <article key={c.id} className="orga__panel s-stack s-stack--tight" data-testid="press-content">
            <div className="s-row s-row--between">
              <div className="s-stack s-stack--tight">
                <div className="o-t-label">
                  {mediaAppLabels.kindOf(c)} · {mediaAppLabels.by(c.media.name)}
                </div>
                <strong className="o-never-truncate">
                  {c.url ? (
                    <a href={c.url} target="_blank" rel="noreferrer">
                      {c.title}
                    </a>
                  ) : (
                    c.title
                  )}
                </strong>
                <span className="o-t-caption s-muted">
                  {c.kind === "gallery" ? `${mediaAppLabels.galleryStats(c.photos.length)} · ` : ""}
                  {mediaAppLabels.viewsCount(c.views)}
                </span>
              </div>
              {c.featured && <Chip variant="accent">{mediaAppLabels.eventFeatured}</Chip>}
            </div>
            <Form method="post">
              <input type="hidden" name="intent" value="feature" />
              <input type="hidden" name="contentId" value={c.id} />
              <input type="hidden" name="featured" value={c.featured ? "false" : "true"} />
              <Button
                type="submit"
                variant="secondary"
                icon={c.featured ? "close" : "up"}
                loading={busy}
                data-testid="press-feature"
              >
                {c.featured ? L.unfeature : L.feature}
              </Button>
            </Form>
          </article>
        ))}
      </section>
    </>
  );
}
