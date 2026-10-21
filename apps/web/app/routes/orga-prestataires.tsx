// Missions et prestataires d'un événement, espace organisateur du site (lot 57, parité de l'API du lot 46 et du tri de
// l'appli du lot 52, `MissionsPanel`) : les besoins (créer, modifier, supprimer), les candidatures de chaque besoin
// (retenir, liste d'attente, refuser : `ProviderTriage` du lot 21), l'emplacement et la consigne d'installation des
// retenus, et après l'événement « Donner un avis » (1 à 5, dans les 30 jours). Les règles sont celles de l'API.
import { Button, CheckboxField, Chip, ChipRow, SelectField, TextField } from "@orasso/design-system/web";
import {
  type ApplicationForTriage,
  type EventNeedForOrganizer,
  type EventOrganizer,
  orgaNeedsLabels as L,
  orgaV2Labels,
  type Page,
  providerPowerLabels,
  providerPowers,
  providerSelectableTypes,
  vendorTypeLabels,
} from "@orasso/shared";
import { data, Form, useNavigation, useRevalidator } from "react-router";

import { TextAreaField } from "../components/Fields";
import { ProviderTriage } from "../components/ProviderTriage";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { nowMs } from "../lib/clock";
import { fromInput, toInput } from "../lib/datetime";
import { formatTime, formatWhen } from "../lib/format";
import "../styles/providers.css";
import type { Route } from "./+types/orga-prestataires";

export function meta() {
  return [{ title: "Prestataires · Orasso" }, { name: "robots", content: "noindex" }];
}

async function providerApplications(request: Request, eventId: string): Promise<ApplicationForTriage[]> {
  const items: ApplicationForTriage[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 20; guard++) {
    const page: Page<ApplicationForTriage> = await apiOrThrow(
      request,
      `/events/${eventId}/applications?kind=provider&sort=created_at&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    items.push(...page.items);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return items;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const membership = me.memberships.find((m) => m.structureSlug === params.structure && m.status === "active");
  if (!membership || membership.role === "staff") {
    throw new Response("Réservé à l'organisation de l'événement.", { status: 403 });
  }
  const id = encodeURIComponent(params.eventId);
  const [event, needs, apps] = await Promise.all([
    apiOrThrow<EventOrganizer>(request, `/events/${id}`),
    apiOrThrow<EventNeedForOrganizer[]>(request, `/events/${id}/needs`),
    providerApplications(request, id),
  ]);
  return {
    event: {
      id: event.id,
      structureId: event.structure.id,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
    },
    needs,
    apps,
    ended: Date.parse(event.endsAt) <= nowMs(),
  };
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

function needBody(form: FormData) {
  const installAt = text(form, "installAt");
  return {
    trade: text(form, "trade"),
    quantity: Number(text(form, "quantity")) || 1,
    power: text(form, "power") || "none",
    water: form.get("water") === "on",
    frontageM: Number(text(form, "frontageM")) || null,
    installAt: installAt ? fromInput(installAt) : null,
    notes: text(form, "notes") || null,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireMe(request);
  const form = await request.formData();
  const intent = text(form, "intent");
  const eventId = encodeURIComponent(params.eventId);
  const target = text(form, "needId") || text(form, "applicationId") || null;
  const fail = (res: { status: number; error: { message: string } }) =>
    data({ error: res.error.message, ok: null, id: target }, { status: res.status });
  const ok = (message: string) => data({ error: null, ok: message, id: target });

  if (intent === "need-create") {
    const res = await api(request, `/events/${eventId}/needs`, { method: "POST", json: needBody(form) });
    return res.ok ? ok(L.saved) : fail(res);
  }
  if (intent === "need-update") {
    const res = await api(request, `/events/${eventId}/needs/${encodeURIComponent(text(form, "needId"))}`, {
      method: "PATCH",
      json: needBody(form),
    });
    return res.ok ? ok(L.saved) : fail(res);
  }
  if (intent === "need-delete") {
    const res = await api(request, `/events/${eventId}/needs/${encodeURIComponent(text(form, "needId"))}`, {
      method: "DELETE",
    });
    return res.ok ? ok(L.saved) : fail(res);
  }
  const appId = encodeURIComponent(text(form, "applicationId"));
  if (intent === "spot") {
    const res = await api(request, `/events/${eventId}/applications/${appId}/spot`, {
      method: "PATCH",
      json: { spotLabel: text(form, "spotLabel") || null, spotNote: text(form, "spotNote") || null },
    });
    return res.ok ? ok(orgaV2Labels.spotSaved) : fail(res);
  }
  if (intent === "review") {
    const res = await api(request, `/events/${eventId}/applications/${appId}/provider-review`, {
      method: "POST",
      json: { rating: Number(text(form, "rating")), comment: text(form, "comment") || null },
    });
    return res.ok ? ok(L.reviewSent) : fail(res);
  }
  return data({ error: "Action inconnue.", ok: null, id: null }, { status: 400 });
}

function NeedFields({ need }: { need?: EventNeedForOrganizer }) {
  return (
    <>
      <div className="s-two">
        <SelectField
          label={L.trade}
          name="trade"
          defaultValue={need?.trade ?? "food_truck"}
          options={providerSelectableTypes.map((t) => ({ value: t, label: vendorTypeLabels[t] }))}
        />
        <TextField
          label={L.quantity}
          name="quantity"
          type="number"
          min={1}
          max={9}
          defaultValue={need?.quantity ?? 1}
        />
      </div>
      <div className="s-two">
        <SelectField
          label={L.power}
          name="power"
          defaultValue={need?.power ?? "none"}
          options={providerPowers.map((p) => ({ value: p, label: providerPowerLabels[p] }))}
        />
        <TextField
          label={L.frontage}
          name="frontageM"
          type="number"
          min={1}
          max={30}
          defaultValue={need?.frontageM ?? ""}
        />
      </div>
      <TextField
        label={L.installAt}
        name="installAt"
        type="datetime-local"
        defaultValue={need?.installAt ? toInput(need.installAt) : ""}
        help={L.installAtHelp}
      />
      <CheckboxField name="water" label={L.water} defaultChecked={need?.water ?? false} />
      <TextAreaField label={L.notes} name="notes" defaultValue={need?.notes ?? ""} maxLength={300} rows={2} />
    </>
  );
}

function Retained({
  app,
  ended,
  busy,
  feedback,
}: {
  app: ApplicationForTriage;
  ended: boolean;
  busy: boolean;
  feedback: { error: string | null; ok: string | null; id: string | null } | undefined;
}) {
  const p = app.provider;
  if (!p) return null;
  return (
    <li className="s-card s-stack s-stack--tight" data-testid="need-retained" data-application={app.id}>
      <div className="s-row s-row--between">
        <strong className="o-never-truncate">{p.name}</strong>
        <a href={`/providers/${p.id}`} className="o-t-caption">
          {L.seeVitrine}
        </a>
      </div>
      {p.spot && <Chip variant="accent">{orgaV2Labels.spotAssigned(p.spot.label)}</Chip>}
      {feedback?.id === app.id && (feedback.error || feedback.ok) && (
        <p className={feedback.error ? "s-error" : "s-notice s-notice--ok"} role="status">
          {feedback.error ?? feedback.ok}
        </p>
      )}
      <details>
        <summary className="o-t-label">{p.spot ? orgaV2Labels.spotTitle : orgaV2Labels.spotAssign}</summary>
        <Form method="post" className="s-form">
          <input type="hidden" name="intent" value="spot" />
          <input type="hidden" name="applicationId" value={app.id} />
          <p className="o-t-caption">{orgaV2Labels.spotHint}</p>
          <TextField
            label={orgaV2Labels.spotLabel}
            name="spotLabel"
            defaultValue={p.spot?.label ?? ""}
            maxLength={12}
          />
          <TextField label={orgaV2Labels.spotNote} name="spotNote" defaultValue={p.spot?.note ?? ""} maxLength={200} />
          <div>
            <Button type="submit" variant="secondary" icon="place" loading={busy} data-testid="spot-save">
              {orgaV2Labels.spotSave}
            </Button>
          </div>
        </Form>
      </details>
      {p.review ? (
        <p className="o-t-caption" data-testid="need-reviewed">
          {L.reviewed(p.review.rating)}
          {p.review.comment ? ` · « ${p.review.comment} »` : ""}
        </p>
      ) : ended ? (
        <details data-testid="need-review">
          <summary className="o-t-label">{L.reviewTitle}</summary>
          <Form method="post" className="s-form">
            <input type="hidden" name="intent" value="review" />
            <input type="hidden" name="applicationId" value={app.id} />
            <SelectField
              label={L.reviewRating}
              name="rating"
              defaultValue="5"
              options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n}/5` }))}
            />
            <TextAreaField label={L.reviewComment} name="comment" maxLength={300} rows={2} />
            <div>
              <Button type="submit" variant="secondary" icon="grade" loading={busy} data-testid="review-send">
                {L.reviewSend}
              </Button>
            </div>
          </Form>
        </details>
      ) : (
        <p className="o-t-caption s-muted">{L.reviewAfter}</p>
      )}
    </li>
  );
}

export default function OrgaPrestataires({ loaderData, actionData }: Route.ComponentProps) {
  const { event, needs, apps, ended } = loaderData;
  const busy = useNavigation().state !== "idle";
  const revalidator = useRevalidator();
  const byNeed = (needId: string | null) => apps.filter((a) => (a.provider?.need?.id ?? null) === needId);
  const free = byNeed(null);
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">{event.title}</div>
          <h1 className="s-title">{L.title}</h1>
          <div className="o-t-meta s-label">{formatWhen(event.startsAt, event.endsAt)}</div>
        </div>
      </div>
      <p className="s-muted">{L.intro}</p>
      {actionData?.error && !actionData.id && (
        <p className="s-error" role="alert">
          {actionData.error}
        </p>
      )}

      <section className="s-stack" aria-labelledby="needs-title" data-testid="needs">
        <h2 id="needs-title" className="s-h2">
          {L.needsTitle} · {needs.length}
        </h2>
        {needs.length === 0 && <p className="s-muted">{L.needsNone}</p>}
        {needs.map((n) => {
          const items = byNeed(n.id);
          return (
            <article key={n.id} className="s-stack pv-need-block" data-testid="need" data-trade={n.trade}>
              <div className="s-row s-row--between">
                <h3 className="s-h2">{orgaV2Labels.missionPlaces(n.tradeLabel, n.filled, n.quantity)}</h3>
                <ChipRow>
                  <Chip>{providerPowerLabels[n.power]}</Chip>
                  {n.water && <Chip>{L.water}</Chip>}
                  {n.installAt && <Chip>{`${L.installAt} ${formatTime(n.installAt)}`}</Chip>}
                </ChipRow>
              </div>
              {n.notes && <p className="o-t-caption">{n.notes}</p>}
              {actionData?.id === n.id && (actionData.error || actionData.ok) && (
                <p className={actionData.error ? "s-error" : "s-notice s-notice--ok"} role="status">
                  {actionData.error ?? actionData.ok}
                </p>
              )}
              <details>
                <summary className="o-t-label">{L.editTitle}</summary>
                <Form method="post" className="s-form">
                  <input type="hidden" name="intent" value="need-update" />
                  <input type="hidden" name="needId" value={n.id} />
                  <NeedFields need={n} />
                  <div className="s-row">
                    <Button type="submit" variant="secondary" icon="check" loading={busy}>
                      {L.save}
                    </Button>
                  </div>
                </Form>
                <Form
                  method="post"
                  onSubmit={(e) => {
                    if (!window.confirm(L.removeConfirm)) e.preventDefault();
                  }}
                >
                  <input type="hidden" name="intent" value="need-delete" />
                  <input type="hidden" name="needId" value={n.id} />
                  <Button type="submit" variant="secondary" icon="close" loading={busy}>
                    {L.remove}
                  </Button>
                </Form>
              </details>
              <h4 className="o-t-label">{L.applicationsTitle}</h4>
              {items.length === 0 ? (
                <p className="s-muted">{L.applicationsNone}</p>
              ) : (
                <ProviderTriage
                  eventId={event.id}
                  structureId={event.structureId}
                  items={items}
                  canDecide
                  canAccreditMedia
                  onChanged={() => revalidator.revalidate()}
                />
              )}
              {items.some((a) => a.status === "accepted") && (
                <>
                  <h4 className="o-t-label">{orgaV2Labels.providersRetained}</h4>
                  <ul className="s-stack s-stack--tight s-list-plain">
                    {items
                      .filter((a) => a.status === "accepted")
                      .map((a) => (
                        <Retained key={a.id} app={a} ended={ended} busy={busy} feedback={actionData} />
                      ))}
                  </ul>
                </>
              )}
            </article>
          );
        })}
      </section>

      {free.length > 0 && (
        <section className="s-stack pv-need-block" aria-labelledby="needs-free" data-testid="needs-free">
          <h2 id="needs-free" className="s-h2">
            {L.freeTitle}
          </h2>
          <ProviderTriage
            eventId={event.id}
            structureId={event.structureId}
            items={free}
            canDecide
            canAccreditMedia
            onChanged={() => revalidator.revalidate()}
          />
          {free.some((a) => a.status === "accepted") && (
            <ul className="s-stack s-stack--tight s-list-plain">
              {free
                .filter((a) => a.status === "accepted")
                .map((a) => (
                  <Retained key={a.id} app={a} ended={ended} busy={busy} feedback={actionData} />
                ))}
            </ul>
          )}
        </section>
      )}

      <section className="orga__panel s-stack" aria-labelledby="need-add" data-testid="need-add">
        <h2 id="need-add" className="s-h2">
          {L.addTitle}
        </h2>
        <Form method="post" className="s-form">
          <input type="hidden" name="intent" value="need-create" />
          <NeedFields />
          <div>
            <Button type="submit" icon="add" loading={busy} data-testid="need-create">
              {L.add}
            </Button>
          </div>
        </Form>
      </section>
    </>
  );
}
