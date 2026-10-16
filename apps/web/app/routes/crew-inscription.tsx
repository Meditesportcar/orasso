import { Button, CheckboxField, Chip, SelectField, StatusBadge } from "@orasso/design-system/web";
import {
  applicationStatusLabels,
  type CrewRegistrationOptions,
  type CrewRegistrationView,
  crewLabels,
  type EventPublic,
  type MyCrew,
} from "@orasso/shared";
import { Fragment, useState } from "react";
import { data, Form, redirect, useNavigation } from "react-router";

import { CrewLogo } from "../components/Crews";
import { PersonAvatar } from "../components/People";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { formatDateTime, formatWhen } from "../lib/format";
import { badgeFor } from "../lib/status";
import type { Route } from "./+types/crew-inscription";

// Inscription en crew (lot 19, docs/01 « trier les candidatures ») : le chef choisit qui vient et avec quel véhicule,
// relit le récapitulatif et envoie. Chaque membre reçoit une notification et confirme sa venue (rien n'est envoyé à
// l'organisateur sans son accord) ; le chef suit les confirmations ici et peut retirer un membre qui n'a pas confirmé.
export function meta({ loaderData }: Route.MetaArgs) {
  return [
    { title: `${crewLabels.registerCrew} · ${loaderData?.event.title ?? "Événement"} · Orasso` },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const event = await apiOrThrow<EventPublic>(request, `/events/by-slug/${encodeURIComponent(params.slug)}`);
  const led = (await apiOrThrow<MyCrew[]>(request, "/me/crews")).filter((c) => c.role === "leader");
  const url = new URL(request.url);
  const crew = led.find((c) => c.id === url.searchParams.get("crew")) ?? led[0] ?? null;
  const options = crew
    ? await apiOrThrow<CrewRegistrationOptions>(
        request,
        `/events/${event.id}/crew-applications/options?crewId=${crew.id}`,
      )
    : null;
  const registrations = await apiOrThrow<CrewRegistrationView[]>(request, `/events/${event.id}/crew-applications/mine`);
  return { event, led, crew, options, registrations, userId: me.user.id, sent: url.searchParams.get("envoye") === "1" };
}

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const eventId = encodeURIComponent(String(form.get("eventId") ?? ""));
  if (intent === "crew_remove_member") {
    const id = encodeURIComponent(String(form.get("applicationId") ?? ""));
    const res = await api(request, `/applications/${id}/crew-remove`, { method: "POST" });
    if (!res.ok) return data({ error: res.error.message }, { status: res.status });
    return data({ error: null as string | null });
  }
  let members: { userId: string; vehicleId: string }[] = [];
  try {
    members = JSON.parse(String(form.get("members") ?? "[]"));
  } catch {
    members = [];
  }
  if (form.get("rules") !== "on") return data({ error: "Coche la case du règlement." }, { status: 400 });
  const res = await api(request, `/events/${eventId}/crew-applications`, {
    method: "POST",
    json: {
      crewId: String(form.get("crewId") ?? ""),
      members,
      rulesAccepted: true,
      followStructure: form.get("follow") === "on",
    },
  });
  if (!res.ok) return data({ error: res.error.message }, { status: res.status });
  throw redirect(`/e/${params.slug}/crew?crew=${encodeURIComponent(String(form.get("crewId") ?? ""))}&envoye=1`);
}

export default function CrewInscription({ loaderData, actionData }: Route.ComponentProps) {
  const { event, led, crew, options, registrations, userId, sent } = loaderData;
  const busy = useNavigation().state !== "idle";
  // Véhicule choisi par membre (absent = ne vient pas).
  const [picked, setPicked] = useState<Record<string, string>>({});
  const chosen = options?.members.filter((m) => picked[m.person.userId]) ?? [];
  const others = chosen.filter((m) => m.person.userId !== userId);
  const closed = event.isLocked || event.status !== "published" || event.admission === "invite_only";
  const mine = registrations.find((r) => r.crew.id === crew?.id);

  return (
    <div className="s-narrow s-stack" data-testid="crew-registration">
      <div className="s-stack s-stack--tight">
        <div className="s-label o-t-label">{crewLabels.registerCrew}</div>
        <h1 className="s-title">
          <a href={`/e/${event.slug}`}>{event.title}</a>
        </h1>
        <div className="o-t-meta s-muted">
          {formatWhen(event.startsAt, event.endsAt)}
          {event.city ? ` · ${event.city}` : ""}
        </div>
      </div>
      {sent && (
        <p className="s-notice s-notice--ok" role="status" data-testid="crew-registration-sent">
          {crewLabels.registerCrewHint}
        </p>
      )}
      {actionData?.error && (
        <p className="s-error" role="alert">
          {actionData.error}
        </p>
      )}

      {led.length === 0 && <p className="s-notice">{crewLabels.registerCrewLeaderOnly}</p>}
      {led.length > 1 && (
        <Form method="get" className="s-row crw-row-end">
          <SelectField
            label={crewLabels.registerCrewChoose}
            name="crew"
            defaultValue={crew?.id}
            options={led.map((c) => ({ value: c.id, label: c.name }))}
          />
          <Button type="submit" variant="secondary" icon="next">
            Choisir
          </Button>
        </Form>
      )}

      {mine && (
        <section className="s-section" aria-labelledby="mon-crew-titre" data-testid="crew-registration-mine">
          <h2 id="mon-crew-titre" className="s-h2">
            {crewLabels.myRegistrations}
          </h2>
          <p className="o-t-caption s-muted">
            {crewLabels.confirmedCount(mine.members.filter((m) => m.confirmed).length, mine.members.length)}
          </p>
          <ul className="s-people">
            {mine.members.map((m) => {
              const badge = badgeFor({ status: m.status });
              return (
                <li key={m.applicationId} className="s-person" data-testid="crew-registration-member">
                  <div className="s-person__main">
                    <span className="o-t-title">{m.pseudo}</span>
                    {m.vehicleLabel && <span className="o-never-truncate">{m.vehicleLabel}</span>}
                    {m.confirmBefore && (
                      <span className="o-t-caption s-muted">
                        {crewLabels.confirmBefore(formatDateTime(m.confirmBefore))}
                      </span>
                    )}
                  </div>
                  {badge ? <StatusBadge status={badge.status} /> : <Chip>{applicationStatusLabels[m.status]}</Chip>}
                  {m.status === "awaiting_member" && (
                    <Form method="post">
                      <input type="hidden" name="intent" value="crew_remove_member" />
                      <input type="hidden" name="applicationId" value={m.applicationId} />
                      <Button type="submit" variant="secondary" icon="close" loading={busy}>
                        {crewLabels.removeFromRegistration}
                      </Button>
                    </Form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {crew && options && !closed && (
        <Form method="post" className="s-stack" data-testid="crew-registration-form">
          <input type="hidden" name="eventId" value={event.id} />
          <input type="hidden" name="crewId" value={crew.id} />
          <input
            type="hidden"
            name="members"
            value={JSON.stringify(chosen.map((m) => ({ userId: m.person.userId, vehicleId: picked[m.person.userId] })))}
          />
          <div className="s-row">
            <CrewLogo url={crew.logoUrl} name={crew.name} size={44} />
            <h2 className="s-h2 o-never-truncate">{crew.name}</h2>
          </div>
          <p className="o-t-caption s-muted">{crewLabels.registerCrewHint}</p>
          <section className="s-card" aria-label={crewLabels.registerCrewWho}>
            <h3 className="s-label o-t-label">{crewLabels.registerCrewWho}</h3>
            {options.members.map((m) => {
              const usable = m.vehicles.filter((x) => !x.blocked);
              const id = m.person.userId;
              return (
                <div key={id} className="crw-pick" data-testid="crew-pick">
                  <CheckboxField
                    checked={Boolean(picked[id])}
                    disabled={Boolean(m.blocked) || usable.length === 0}
                    onChange={(e) => {
                      const on = e.currentTarget.checked;
                      setPicked((cur) => {
                        const next = { ...cur };
                        if (on && usable[0]) next[id] = usable[0].id;
                        else delete next[id];
                        return next;
                      });
                    }}
                    label={
                      <span className="s-row s-row--tight">
                        <PersonAvatar url={m.person.avatarUrl} pseudo={m.person.pseudo} size={28} />
                        {m.isLeader ? `${m.person.pseudo} (${crewLabels.registerCrewSelf})` : m.person.pseudo}
                      </span>
                    }
                  />
                  {m.blocked && <span className="o-t-caption s-muted">{m.blocked}</span>}
                  {!m.blocked && usable.length === 0 && (
                    <span className="o-t-caption s-muted">{crewLabels.registerCrewNoVehicle}</span>
                  )}
                  {picked[id] && (
                    <div className="crw-pick__vehicles" role="radiogroup" aria-label={`Véhicule de ${m.person.pseudo}`}>
                      {m.vehicles.map((x) => (
                        <label key={x.id} className="crw-radio">
                          <input
                            type="radio"
                            name={`vehicle-${id}`}
                            checked={picked[id] === x.id}
                            disabled={Boolean(x.blocked)}
                            onChange={() => setPicked((cur) => ({ ...cur, [id]: x.id }))}
                          />
                          <span className="o-never-truncate">{x.label}</span>
                          {x.blocked && <span className="o-t-caption s-muted">· {x.blocked}</span>}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          <section className="s-card" aria-labelledby="recap-titre" data-testid="crew-registration-recap">
            <h3 id="recap-titre" className="s-label o-t-label">
              {crewLabels.registerCrewRecap}
            </h3>
            {chosen.length === 0 ? (
              <p className="s-muted">{crewLabels.registerCrewNeedMember}</p>
            ) : (
              <dl className="s-recap">
                {chosen.map((m) => (
                  <Fragment key={m.person.userId}>
                    <dt>{m.person.pseudo}</dt>
                    <dd className="o-never-truncate">
                      {m.vehicles.find((x) => x.id === picked[m.person.userId])?.label}
                    </dd>
                  </Fragment>
                ))}
              </dl>
            )}
          </section>

          <CheckboxField name="rules" required label={crewLabels.registerCrewRules} />
          <CheckboxField
            name="follow"
            defaultChecked
            label="Suivre l'organisateur (nouveaux événements, avant-premières)"
          />
          <Button
            type="submit"
            icon="crew"
            loading={busy}
            disabled={others.length === 0}
            data-testid="crew-registration-send"
          >
            {crewLabels.registerCrewSend}
          </Button>
        </Form>
      )}
      {closed && <p className="s-notice">Les inscriptions ne sont pas ouvertes pour cet événement.</p>}
    </div>
  );
}
