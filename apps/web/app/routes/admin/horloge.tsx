// Administration : horloge simulée (lot 34a, développement seulement). Avance le temps d'Orasso pour voir tout de suite
// verrouillage, rappels, points et malus, bilan. Page à part (pas dans les réglages) : elle n'existe que si DEV_CLOCK est
// posée, sinon 404 comme si la route n'existait pas.
import { Button, Chip, Plate, SelectField, TextField } from "@orasso/design-system/web";
import {
  type ClockAdvanceResult,
  type ClockEventRow,
  type ClockMilestone,
  type ClockStatus,
  clockMilestones,
  devClockMilestoneLabels,
  formatClockOffset,
  devClockLabels as L,
} from "@orasso/shared";
import { useState } from "react";
import { data, Form, useNavigation } from "react-router";

import { requireSuperAdmin } from "../../lib/admin.server";
import { api, apiOrThrow } from "../../lib/api.server";
import { devClockEnabled } from "../../lib/clock.server";
import { fromInput } from "../../lib/datetime";
import { formatDateTime } from "../../lib/format";
import type { Route } from "./+types/horloge";
import "../../styles/dev-clock.css";

export function meta() {
  return [{ title: "Horloge simulée · Administration · Orasso" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  if (!devClockEnabled()) throw new Response("Introuvable", { status: 404 });
  await requireSuperAdmin(request);
  const [status, events] = await Promise.all([
    apiOrThrow<ClockStatus>(request, "/dev/clock"),
    apiOrThrow<{ items: ClockEventRow[] }>(request, "/dev/clock/events"),
  ]);
  return { status, events: events.items };
}

export async function action({ request }: Route.ActionArgs) {
  if (!devClockEnabled()) throw new Response("Introuvable", { status: 404 });
  await requireSuperAdmin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (intent === "reset") {
    const res = await api<ClockStatus>(request, "/dev/clock/reset", { method: "POST" });
    if (!res.ok) return data({ error: res.error.message }, { status: res.status });
    return { reset: true as const };
  }
  let json: Record<string, string>;
  if (intent === "by-1h") json = { by: "1h" };
  else if (intent === "by-1d") json = { by: "1d" };
  else if (intent === "to") {
    const to = fromInput(String(form.get("to") ?? ""));
    if (!to) return data({ error: L.advanceToHint }, { status: 400 });
    json = { to };
  } else if (intent === "milestone") {
    json = { eventId: String(form.get("eventId") ?? ""), milestone: String(form.get("milestone") ?? "") };
  } else return data({ error: "Action inconnue" }, { status: 400 });
  const res = await api<ClockAdvanceResult>(request, "/dev/clock/advance", { method: "POST", json });
  if (!res.ok) return data({ error: res.error.message }, { status: res.status });
  return { advanced: res.data };
}

export default function AdminClock({ loaderData, actionData }: Route.ComponentProps) {
  const { status, events } = loaderData;
  const result = actionData as { error?: string; reset?: boolean; advanced?: ClockAdvanceResult } | undefined;
  const busy = useNavigation().state !== "idle";
  const nowMs = Date.parse(status.now);
  // Par défaut : le premier événement qui a encore un jalon devant lui, et ce jalon.
  const firstAhead = events.find((e) => e.milestones.some((m) => Date.parse(m.at) > nowMs)) ?? events[0];
  const [eventId, setEventId] = useState(firstAhead?.id ?? "");
  const [milestone, setMilestone] = useState<ClockMilestone>(
    firstAhead?.milestones.find((m) => Date.parse(m.at) > nowMs)?.milestone ?? "h-2",
  );
  const selected = events.find((e) => e.id === eventId);
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Administration</div>
          <h1 className="s-title">{L.title}</h1>
          <p className="s-muted">{L.intro}</p>
        </div>
      </div>

      <Plate className="clock-page__now" data-testid="clock-status">
        <div>
          <span className="o-t-caption s-muted">{L.simulatedNow}</span>
          <time className="clock-page__time" dateTime={status.now} data-testid="clock-now">
            {formatDateTime(status.now)}
          </time>
        </div>
        <div>
          <span className="o-t-caption s-muted">{L.realNow}</span>
          <time className="clock-page__time" dateTime={status.realNow}>
            {formatDateTime(status.realNow)}
          </time>
        </div>
        <div>
          <span className="o-t-caption s-muted">{L.offset}</span>
          <strong className="clock-page__time" data-testid="clock-offset">
            {formatClockOffset(status.offsetMs) || L.noOffset}
          </strong>
        </div>
      </Plate>

      {result?.error && (
        <p className="s-error" role="alert" data-testid="clock-error">
          {result.error}
        </p>
      )}
      {result?.reset && (
        <p className="s-notice s-notice--ok" role="status" data-testid="clock-reset-done">
          {L.resetDone}
        </p>
      )}
      {result?.advanced && (
        <section className="s-notice s-notice--ok s-stack s-stack--tight" role="status" data-testid="clock-advanced">
          <p>
            <strong>{L.advanced}</strong> {L.releasedJobs(result.advanced.releasedJobs)}
          </p>
          <span className="o-t-label">{L.sweepsTitle}</span>
          <ul className="clock-page__sweeps">
            {result.advanced.sweeps.map((s) => (
              <li key={s.name}>
                <Chip variant={s.ok ? undefined : "accent"}>
                  {s.name} · {s.ok ? L.sweepsOk : L.sweepsFailed}
                </Chip>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="orga__panel s-stack" aria-label="Avancer">
        <Form method="post" className="s-row">
          <Button type="submit" name="intent" value="by-1h" variant="secondary" icon="next" loading={busy}>
            {L.advance1h}
          </Button>
          <Button type="submit" name="intent" value="by-1d" variant="secondary" icon="next" loading={busy}>
            {L.advance1d}
          </Button>
        </Form>
        <Form method="post" className="s-row">
          <TextField
            label={L.advanceTo}
            name="to"
            type="datetime-local"
            help={L.advanceToHint}
            required
            data-testid="clock-to"
          />
          <Button type="submit" name="intent" value="to" variant="secondary" icon="calendar" loading={busy}>
            {L.advanceTo}
          </Button>
        </Form>
      </section>

      <section className="orga__panel s-stack" aria-label={L.event}>
        {events.length === 0 ? (
          <p className="s-notice" data-testid="clock-no-event">
            {L.noEvent}
          </p>
        ) : (
          <Form method="post" className="s-stack">
            <p className="s-muted">{L.eventHint}</p>
            <div className="s-row">
              <SelectField
                label={L.event}
                name="eventId"
                value={eventId}
                onChange={(e) => setEventId(e.currentTarget.value)}
                options={events.map((e) => ({ value: e.id, label: `${e.title} · ${formatDateTime(e.startsAt)}` }))}
              />
              <SelectField
                label={L.goTo}
                name="milestone"
                value={milestone}
                onChange={(e) => setMilestone(e.currentTarget.value as ClockMilestone)}
                options={clockMilestones.map((m) => ({ value: m, label: devClockMilestoneLabels[m] }))}
              />
            </div>
            {selected && (
              <ul className="clock-page__milestones" data-testid="clock-milestones">
                {selected.milestones.map((m) => {
                  const reached = Date.parse(m.at) <= nowMs;
                  return (
                    <li key={m.milestone} className="clock-page__milestone" data-reached={reached}>
                      <span className="o-t-label">{devClockMilestoneLabels[m.milestone]}</span>
                      <time dateTime={m.at}>{formatDateTime(m.at)}</time>
                      {reached && <Chip>{L.reached}</Chip>}
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="s-row">
              <Button
                type="submit"
                name="intent"
                value="milestone"
                icon="next"
                loading={busy}
                disabled={
                  !selected || Date.parse(selected.milestones.find((m) => m.milestone === milestone)?.at ?? "") <= nowMs
                }
              >
                {L.goTo}
              </Button>
            </div>
          </Form>
        )}
      </section>

      <Form method="post">
        <Button
          type="submit"
          name="intent"
          value="reset"
          variant="secondary"
          icon="undo"
          loading={busy}
          disabled={status.offsetMs === 0}
        >
          {L.reset}
        </Button>
      </Form>
    </>
  );
}
