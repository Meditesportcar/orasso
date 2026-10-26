import { Button, TextField } from "@orasso/design-system/web";
import {
  CREW_OUTING_PLACE_MAX,
  CREW_OUTING_PROGRAM_MAX,
  CREW_OUTING_TITLE_MAX,
  type CrewOutingView,
  type CrewView,
  crewErrors,
  fromWallTime,
  crewPageLabels as L,
  wallTime,
} from "@orasso/shared";
import { useState } from "react";
import { data, Form, redirect, useNavigation } from "react-router";

import { InfoBox } from "../components/crew-page/CrewPage";
import { EventMap } from "../components/EventMap";
import { FicheBar, ficheHandle } from "../components/FicheBar";
import { TextAreaField } from "../components/Fields";
import { apiFetch } from "../lib/api.client";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import type { Route } from "./+types/crew-sortie";

// Proposer (ou modifier, `?sortie=<id>`) une sortie du crew sur le site (lot R5c2, maquette R5.9), comme l'appli : nom,
// jour, heure de rendez-vous, point de rendez-vous (adresse, puis l'épingle sur la carte, comme la création
// d'événement), programme, la ligne de visibilité, « Proposer la sortie ». Mode B (en-tête de fiche).
export const handle = ficheHandle;

export function meta() {
  return [{ title: `${L.outingFormTitle} · Orasso` }, { name: "robots", content: "noindex" }];
}

const pad = (n: number) => String(n).padStart(2, "0");

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireMe(request);
  const crew = await apiOrThrow<CrewView>(request, `/crews/by-slug/${encodeURIComponent(params.slug)}`);
  const id = new URL(request.url).searchParams.get("sortie");
  const editing = id ? (crew.space?.outings.find((o) => o.id === id) ?? null) : null;
  return { crew, editing, missing: Boolean(id && !editing) };
}

type Errors = { form?: string };

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  const crewId = encodeURIComponent(String(form.get("crewId") ?? ""));
  const outingId = String(form.get("outingId") ?? "");
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(form.get("day") ?? "").trim());
  const time = /^(\d{1,2}):(\d{2})$/.exec(String(form.get("time") ?? "").trim());
  if (!day || !time) return data<{ errors: Errors }>({ errors: { form: L.outingMissing([L.outingMissingDay]) } }, 400);
  const [year, month, dayOfMonth, hour, minute] = [day[1], day[2], day[3], time[1], time[2]].map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const lat = Number.parseFloat(String(form.get("lat") ?? ""));
  const lng = Number.parseFloat(String(form.get("lng") ?? ""));
  const point = Number.isFinite(lat) && Number.isFinite(lng);
  const body = {
    title: String(form.get("title") ?? "").trim(),
    startsAt: fromWallTime({ year, month, day: dayOfMonth, hour, minute }).toISOString(),
    place: String(form.get("place") ?? "").trim(),
    lat: point ? lat : null,
    lng: point ? lng : null,
    program: String(form.get("program") ?? "").trim() || null,
  };
  const res = outingId
    ? await api<CrewOutingView>(request, `/crews/${crewId}/outings/${encodeURIComponent(outingId)}`, {
        method: "PATCH",
        json: body,
      })
    : await api<CrewOutingView>(request, `/crews/${crewId}/outings`, { method: "POST", json: body });
  if (!res.ok) return data<{ errors: Errors }>({ errors: { form: res.error.message } }, { status: res.status });
  throw redirect(`/c/${params.slug}?onglet=sorties`);
}

type Match = { lat: number; lng: number; label: string };

export default function CrewOuting({ loaderData, actionData }: Route.ComponentProps) {
  const { crew, editing, missing } = loaderData;
  const busy = useNavigation().state !== "idle";
  const errors: Errors = (actionData && "errors" in actionData ? actionData.errors : undefined) ?? {};
  const start = editing ? wallTime(new Date(editing.startsAt)) : null;
  const [title, setTitle] = useState(editing?.title ?? "");
  const [day, setDay] = useState(start ? `${start.year}-${pad(start.month)}-${pad(start.day)}` : "");
  const [time, setTime] = useState(start ? `${pad(start.hour)}:${pad(start.minute)}` : "");
  const [place, setPlace] = useState(editing?.place ?? "");
  const [pin, setPin] = useState<{ lat: number | null; lng: number | null }>({
    lat: editing?.lat ?? null,
    lng: editing?.lng ?? null,
  });
  const [status, setStatus] = useState<string | null>(null);
  const back = `/c/${crew.slug}?onglet=sorties`;
  const heading = editing ? L.outingEditTitle : L.outingFormTitle;
  const lacking = [
    title.trim().length < 3 ? L.outingMissingName : null,
    day ? null : L.outingMissingDay,
    time ? null : L.outingMissingTime,
    place.trim().length < 3 ? L.outingMissingPlace : null,
  ].filter((x) => x !== null) as string[];

  async function find() {
    if (place.trim().length < 3) return;
    setStatus(L.outingFinding);
    const res = await apiFetch<{ match: Match | null }>(`/geocode?q=${encodeURIComponent(place.trim())}`);
    if (res.ok && res.data.match) {
      setPin({ lat: res.data.match.lat, lng: res.data.match.lng });
      setStatus(L.outingFound(res.data.match.label));
    } else setStatus(L.outingNotFound);
  }

  if (!crew.space || missing || (!editing && !crew.space.canProposeOuting)) {
    return (
      <>
        <FicheBar title={heading} back={back} />
        <div className="crw-narrow">
          <p className="s-error" role="alert">
            {crew.space ? L.proposeReserved : crewErrors.membersOnly}
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <FicheBar title={heading} back={back} />
      <Form method="post" className="crw-narrow s-form" data-testid="outing-form">
        <p className="o-t-caption s-muted">{L.outingFormSub(crew.name)}</p>
        <input type="hidden" name="crewId" value={crew.id} />
        {editing ? <input type="hidden" name="outingId" value={editing.id} /> : null}
        <input type="hidden" name="lat" value={pin.lat ?? ""} />
        <input type="hidden" name="lng" value={pin.lng ?? ""} />
        <TextField
          label={L.outingName}
          name="title"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          maxLength={CREW_OUTING_TITLE_MAX}
          placeholder={L.outingNamePlaceholder}
          required
          data-testid="outing-title"
        />
        <div className="crw-two">
          <TextField
            label={L.outingDay}
            name="day"
            type="date"
            value={day}
            onChange={(e) => setDay(e.currentTarget.value)}
            required
            data-testid="outing-day"
          />
          <TextField
            label={L.outingTime}
            name="time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.currentTarget.value)}
            required
            data-testid="outing-time"
          />
        </div>
        <TextField
          label={L.outingPlace}
          name="place"
          value={place}
          onChange={(e) => setPlace(e.currentTarget.value)}
          maxLength={CREW_OUTING_PLACE_MAX}
          placeholder={L.outingPlacePlaceholder}
          required
          data-testid="outing-place"
        />
        <p>
          <Button type="button" variant="secondary" icon="place" onClick={() => void find()} data-testid="outing-find">
            {L.outingFind}
          </Button>
        </p>
        <div className="crw-mapbox">
          <EventMap
            lat={pin.lat}
            lng={pin.lng}
            label={place || L.outingPlace}
            draggablePin
            onPinMove={(lat, lng) => setPin({ lat, lng })}
          />
        </div>
        <p className="o-t-caption s-muted" data-testid="outing-point">
          {status ?? (pin.lat !== null ? L.outingPointSet : `${L.outingMapHintWeb}. ${L.outingPointMissing}`)}
        </p>
        <TextAreaField
          label={L.outingProgram}
          name="program"
          rows={3}
          maxLength={CREW_OUTING_PROGRAM_MAX}
          defaultValue={editing?.program ?? ""}
          placeholder={L.outingProgramPlaceholder}
          data-testid="outing-program"
        />
        <InfoBox icon="lock" title={L.outingVisibility(crew.membersCount)} caption={L.outingVisibilityHint} />
        <p className="o-t-caption s-muted">{L.outingNote}</p>
        {errors.form ? (
          <p className="s-error" role="alert">
            {errors.form}
          </p>
        ) : null}
        {lacking.length ? (
          <p className="o-t-caption s-muted" data-testid="outing-missing">
            {L.outingMissing(lacking)}
          </p>
        ) : null}
        <Button
          type="submit"
          icon="send"
          loading={busy}
          disabled={lacking.length > 0}
          fullWidth
          data-testid="outing-send"
        >
          {editing ? L.outingSave : L.outingSend}
        </Button>
      </Form>
    </>
  );
}
