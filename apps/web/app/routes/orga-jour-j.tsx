import { Button, Chip, Counters, StatusBadge, TextField } from "@orasso/design-system/web";
import type {
  CheckinListItem,
  CheckinResult,
  EventOrganizer,
  EventReviews,
  IncidentView,
  LiveCounters,
  MalusContestView,
  MyStaffEvent,
  StaffAlertView,
} from "@orasso/shared";
import {
  distanceFromEntryLabel,
  eventDaysLabels,
  formatDayDate,
  liveLabels,
  localDate,
  orgaDriveLabels,
} from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { now as clockNow } from "../lib/clock";
import "../styles/staff.css";

import { AfterEvent } from "../components/AfterEvent";
import { apiFetch } from "../lib/api.client";
import { api } from "../lib/api.server";
import { formatDateTime, formatWhen } from "../lib/format";
import { useChannel } from "../lib/useChannel";
import type { Route } from "./+types/orga-jour-j";

export function meta() {
  return [{ title: "Jour J · Orasso" }, { name: "robots", content: "noindex" }];
}

type EventInfo = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  /** Lot 26 : jours d'un événement sur plusieurs jours (organisateur). */
  days: { id: string; date: string }[];
};
type PlateOutcome = {
  matched: (CheckinResult & { plate: string })[];
  unmatched: string[];
  /** Lot 26 : plaque retenue plusieurs fois pour aujourd'hui (jour et tout l'événement) : rien de pointé. */
  ambiguous?: string[];
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const eventId = params.eventId;
  let event: EventInfo | null = null;
  let organizer = false;
  const full = await api<EventOrganizer>(request, `/events/${eventId}`);
  if (full.ok) {
    organizer = true;
    event = {
      id: full.data.id,
      title: full.data.title,
      startsAt: full.data.startsAt,
      endsAt: full.data.endsAt,
      days: full.data.days.map((d) => ({ id: d.id, date: d.date })),
    };
  } else {
    const mine = await api<MyStaffEvent[]>(request, "/me/staff-events");
    const found = mine.ok ? mine.data.find((m) => m.event.id === eventId) : undefined;
    if (found)
      event = {
        id: found.event.id,
        title: found.event.title,
        startsAt: found.event.startsAt,
        endsAt: found.event.endsAt,
        days: [],
      };
  }
  if (!event) throw new Response("Événement introuvable", { status: 404 });
  // Lot 26 : le jour affiché (`?jour=`, sinon aujourd'hui s'il fait partie des jours, sinon tous les jours).
  const asked = new URL(request.url).searchParams.get("jour");
  const today = localDate(clockNow());
  const dayId =
    asked === "tous"
      ? null
      : ((event.days.find((d) => d.id === asked) ?? event.days.find((d) => d.date === today))?.id ?? null);
  const dayQs = dayId ? `?dayId=${dayId}` : "";
  const list = await api<CheckinListItem[]>(request, `/events/${eventId}/checkins${dayQs}`);
  const live = organizer ? await api<LiveCounters>(request, `/events/${eventId}/live${dayQs}`) : null;
  // Après l'événement (organisateur) : avis et droit de réponse, contestations de malus.
  const reviews = organizer ? await api<EventReviews>(request, `/events/${eventId}/reviews`) : null;
  const contests = organizer ? await api<MalusContestView[]>(request, `/events/${eventId}/malus-contests`) : null;
  // Terrain (lot 24) : alertes du staff avec leur position (tant qu'elles sont ouvertes) et main courante avec photo.
  const alerts = organizer ? await api<StaffAlertView[]>(request, `/events/${eventId}/alerts`) : null;
  const incidents = organizer ? await api<IncidentView[]>(request, `/events/${eventId}/incidents`) : null;
  return {
    alerts: alerts?.ok ? alerts.data : [],
    incidents: incidents?.ok ? incidents.data : [],
    event,
    dayId,
    organizer,
    items: list.ok ? list.data : [],
    listError: list.ok ? null : list.error.message,
    live: live?.ok ? live.data : null,
    reviews: reviews?.ok ? reviews.data : null,
    contests: contests?.ok ? contests.data : [],
  };
}

type Filter = "all" | "arrived" | "expected";

export default function OrgaJourJ({ loaderData }: Route.ComponentProps) {
  const { event, organizer, listError, dayId } = loaderData;
  const dayQs = dayId ? `?dayId=${dayId}` : "";
  const [items, setItems] = useState<CheckinListItem[]>(loaderData.items);
  const [live, setLive] = useState<LiveCounters | null>(loaderData.live);
  const [alerts, setAlerts] = useState<StaffAlertView[]>(loaderData.alerts);
  const [incidents, setIncidents] = useState<IncidentView[]>(loaderData.incidents);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [plates, setPlates] = useState("");
  const [plateBusy, setPlateBusy] = useState(false);
  const [outcome, setOutcome] = useState<PlateOutcome | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => setItems(loaderData.items), [loaderData.items]);
  useEffect(() => setLive(loaderData.live), [loaderData.live]);
  useEffect(() => setAlerts(loaderData.alerts), [loaderData.alerts]);
  useEffect(() => setIncidents(loaderData.incidents), [loaderData.incidents]);

  const refetch = useCallback(async () => {
    const res = await apiFetch<CheckinListItem[]>(`/events/${event.id}/checkins${dayQs}`);
    if (res.ok) setItems(res.data);
  }, [event.id, dayQs]);

  // Lot 26 : un jour choisi, le direct se relit pour ce jour (la diffusion compte tous les jours).
  const refetchLive = useCallback(async () => {
    const res = await apiFetch<LiveCounters>(`/events/${event.id}/live${dayQs}`);
    if (res.ok) setLive(res.data);
  }, [event.id, dayQs]);

  const refetchField = useCallback(async () => {
    const [a, i] = await Promise.all([
      apiFetch<StaffAlertView[]>(`/events/${event.id}/alerts`),
      apiFetch<IncidentView[]>(`/events/${event.id}/incidents`),
    ]);
    if (a.ok) setAlerts(a.data);
    if (i.ok) setIncidents(i.data);
  }, [event.id]);

  // Direct : les compteurs arrivent par WebSocket, la liste se rafraîchit juste après (autres appareils du staff).
  useChannel(organizer ? `event:${event.id}:live` : null, (m) => {
    if (m.type === "live") {
      if (dayId) void refetchLive();
      else setLive(m.payload as LiveCounters);
    }
    if (m.type === "alert" || m.type === "alert.resolved" || m.type === "incident") void refetchField();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void refetch(), 400);
  });
  useChannel(!organizer ? `event:${event.id}:access` : null, () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void refetch(), 400);
  });

  // Lot 26 : liste d'un jour : « arrivé » ce jour-là (même règle que le direct) ; sinon, entrée enregistrée.
  const isIn = (i: CheckinListItem) => i.arrivedOnDay ?? Boolean(i.checkedInAt);
  const arrived = items.filter(isIn).length;
  const drive = items.filter((i) => i.method === "drive" && isIn(i)).length;
  const shown = items.filter((i) => {
    if (filter === "arrived" && !isIn(i)) return false;
    if (filter === "expected" && isIn(i)) return false;
    const q = search.trim().toLowerCase();
    return !q || i.pseudo.toLowerCase().includes(q) || (i.vehicleLabel ?? "").toLowerCase().includes(q);
  });

  async function check(applicationId: string) {
    setBusyId(applicationId);
    setMessage(null);
    const res = await apiFetch<CheckinResult>(`/events/${event.id}/checkins`, {
      method: "POST",
      json: { applicationId, method: "manual" },
    });
    setBusyId(null);
    if (!res.ok) return setMessage(res.error.message);
    const row: CheckinListItem = res.data;
    setItems((cur) => cur.map((i) => (i.applicationId === row.applicationId ? row : i)));
    setMessage(`${row.pseudo} : entrée enregistrée.`);
  }

  async function checkPlates() {
    const list = plates
      .split(/[\n,;]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (list.length === 0) return;
    setPlateBusy(true);
    setMessage(null);
    const res = await apiFetch<PlateOutcome>(`/events/${event.id}/checkins/by-plates`, {
      method: "POST",
      json: { plates: list },
    });
    setPlateBusy(false);
    if (!res.ok) return setMessage(res.error.message);
    setOutcome(res.data);
    setPlates("");
    await refetch();
  }

  const fmtCount = (n: number | undefined) => n ?? 0;
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Jour J et après · {event.title}</div>
          <h1 className="s-title">Pointage</h1>
          <div className="o-t-meta s-label">{formatWhen(event.startsAt, event.endsAt)}</div>
        </div>
      </div>

      {event.days.length > 1 && (
        <nav className="s-row s-chips-wrap" aria-label={eventDaysLabels.days} data-testid="jourj-days">
          <a href="?jour=tous" aria-current={dayId === null ? "page" : undefined}>
            <Chip selected={dayId === null}>{eventDaysLabels.allDays}</Chip>
          </a>
          {event.days.map((d) => (
            <a key={d.id} href={`?jour=${d.id}`} aria-current={dayId === d.id ? "page" : undefined}>
              <Chip selected={dayId === d.id}>{formatDayDate(d.date)}</Chip>
            </a>
          ))}
        </nav>
      )}

      {listError && (
        <p className="s-notice s-notice--alert" role="alert">
          {listError}
        </p>
      )}

      <Counters
        variant="surface"
        size="site"
        data-testid="live-counters"
        items={
          live
            ? [
                { value: fmtCount(live.arrived), label: "arrivés" },
                { value: Math.max(live.expected - live.arrived, 0), label: "attendus" },
                { value: `${fmtCount(live.staffPresent)}/${fmtCount(live.staffExpected)}`, label: "staff" },
                ...(live.providers.expected > 0
                  ? [
                      {
                        value: `${fmtCount(live.providers.arrived)}/${fmtCount(live.providers.expected)}`,
                        label: "prestataires arrivés",
                      },
                    ]
                  : []),
                { value: fmtCount(live.alertsOpen), label: "alertes" },
                ...(live.visitors > 0 || live.tickets.sold > 0
                  ? [
                      { value: fmtCount(live.visitors), label: liveLabels.visitors.toLowerCase() },
                      ...(live.tickets.sold > 0
                        ? [{ value: `${live.tickets.used}/${live.tickets.sold}`, label: "billets contrôlés" }]
                        : []),
                    ]
                  : []),
              ]
            : [
                { value: arrived, label: "arrivés" },
                { value: items.length - arrived, label: "attendus" },
              ]
        }
      />
      {/* Lot 57 : rapport des pointages, entrées par l'accueil drive (lecture de plaque, lot 48). */}
      {drive > 0 && (
        <p className="o-t-caption" data-testid="drive-count">
          {orgaDriveLabels.count(drive)}
        </p>
      )}

      {live && live.byZone.length > 0 && (
        <section className="orga__panel s-stack s-stack--tight" aria-label="Par zone">
          <h2 className="s-h2">Par zone</h2>
          <div className="s-row">
            {live.byZone.map((z) => (
              <Chip key={z.zoneId ?? "none"}>
                {z.code ?? "Sans zone"} · {z.arrived}/{z.expected}
              </Chip>
            ))}
          </div>
        </section>
      )}

      {organizer && live && live.byCategory.length > 0 && (
        <section className="orga__panel s-stack" aria-label={liveLabels.byCategory} data-testid="live-by-category">
          <h2 className="s-h2">{liveLabels.byCategory}</h2>
          <ul className="livep__bars">
            {live.byCategory.map((c) => (
              <li key={c.categoryId} className="livep__bar" data-testid="live-category">
                <span>{c.label}</span>
                <strong className="o-t-number">
                  {c.arrived} / {c.expected}
                </strong>
                <span className="livep__track" aria-hidden="true">
                  <span
                    className="livep__fill"
                    style={{
                      width: `${c.expected > 0 ? Math.min(100, Math.round((c.arrived / c.expected) * 100)) : 0}%`,
                    }}
                  />
                </span>
              </li>
            ))}
          </ul>
          {live.providers.expected > 0 && (
            <p data-testid="live-providers">
              {liveLabels.providers} · <strong>{live.providers.arrived}</strong> / {live.providers.expected}
            </p>
          )}
        </section>
      )}

      {organizer && (
        <section className="orga__panel s-stack" aria-labelledby="alertes-titre" data-testid="field-alerts">
          <h2 id="alertes-titre" className="s-h2">
            Alertes du staff
          </h2>
          {alerts.length === 0 ? (
            <p className="s-muted">Aucune alerte.</p>
          ) : (
            <ul className="livep__list">
              {alerts.map((a) => (
                <li
                  key={a.id}
                  className="livep__item"
                  data-testid="field-alert"
                  data-open={a.resolvedAt ? "no" : "yes"}
                >
                  <div className="s-row s-row--between">
                    <strong>{a.pseudo ?? "Staff"}</strong>
                    <Chip variant={a.resolvedAt ? undefined : "accent"}>
                      {a.resolvedAt ? liveLabels.alertClosed : liveLabels.alertOpen}
                    </Chip>
                  </div>
                  <p className="s-prewrap">{a.message ?? "Besoin d'aide"}</p>
                  <div className="o-t-caption s-muted">
                    {formatDateTime(a.createdAt)}
                    {a.lat !== null && a.lng !== null ? (
                      <>
                        {" · "}
                        {distanceFromEntryLabel(a.distanceM) ?? "position partagée"}
                        {" · "}
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${a.lat}&mlon=${a.lng}#map=19/${a.lat}/${a.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid="alert-map-link"
                        >
                          {liveLabels.alertPosition}
                        </a>
                      </>
                    ) : a.resolvedAt ? null : (
                      <>
                        {" · "}
                        {liveLabels.noPosition}
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {organizer && (
        <section className="orga__panel s-stack" aria-labelledby="courante-titre" data-testid="field-incidents">
          <h2 id="courante-titre" className="s-h2">
            Main courante
          </h2>
          {incidents.length === 0 ? (
            <p className="s-muted">Aucun incident noté.</p>
          ) : (
            <ul className="livep__list">
              {incidents.map((i) => (
                <li key={i.id} className="livep__item" data-testid="field-incident">
                  <div className="s-row s-row--between">
                    <strong>{formatDateTime(i.occurredAt)}</strong>
                    <span className="o-t-caption s-muted">{[i.location, i.reporter].filter(Boolean).join(" · ")}</span>
                  </div>
                  <p className="s-prewrap">{i.description}</p>
                  {i.hasPhoto && (
                    <img
                      className="livep__photo"
                      src={`/api/events/${event.id}/incidents/${i.id}/photo`}
                      alt={`Pièce jointe de l'incident du ${formatDateTime(i.occurredAt)}`}
                      loading="lazy"
                      data-testid="incident-photo"
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="orga__panel s-stack" aria-label="Pointage rapide par plaque">
        <h2 className="s-h2">Pointage rapide par plaque</h2>
        <form
          className="s-plate-in"
          onSubmit={(e) => {
            e.preventDefault();
            void checkPlates();
          }}
        >
          <TextField
            label="Plaques (une par ligne ou séparées par une virgule)"
            name="plates"
            value={plates}
            onChange={(e) => setPlates(e.currentTarget.value)}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="AB-123-CD"
          />
          <Button type="submit" icon="plate" loading={plateBusy}>
            Pointer
          </Button>
        </form>
        {outcome && (
          <div className="s-stack s-stack--tight" data-testid="plate-outcome">
            {outcome.matched.map((m) => (
              <div key={m.applicationId}>
                {m.plate} → {m.pseudo} · {m.vehicleLabel ?? "—"} {m.created ? "entré" : "déjà entré"}
              </div>
            ))}
            {outcome.unmatched.map((p) => (
              <div key={p} className="s-error">
                {p} : aucune plaque retenue ne correspond.
              </div>
            ))}
            {(outcome.ambiguous ?? []).map((p) => (
              <div key={p} className="s-error" data-testid="plate-ambiguous">
                {p} : plusieurs inscriptions aujourd'hui, pointe depuis la liste.
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="orga__panel s-stack" aria-label="Participants" data-testid="participants">
        <div className="s-row s-row--between">
          <h2 className="s-h2">Participants · {items.length}</h2>
          <div className="s-row">
            {(
              [
                ["all", "Tous"],
                ["arrived", `Arrivés · ${arrived}`],
                ["expected", `Attendus · ${items.length - arrived}`],
              ] as const
            ).map(([id, label]) => (
              <Chip key={id} selected={filter === id} onClick={() => setFilter(id)}>
                {label}
              </Chip>
            ))}
          </div>
        </div>
        <TextField
          label="Recherche"
          name="q"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="Pseudo ou véhicule"
        />
        {message && (
          <p className="s-notice s-notice--ok" role="status" data-testid="checkin-message">
            {message}
          </p>
        )}
        <div className="s-table-wrap">
          <table className="s-table">
            <thead>
              <tr className="o-t-label">
                <th scope="col">Participant</th>
                <th scope="col">Véhicule</th>
                <th scope="col">Zone</th>
                <th scope="col">Entrée</th>
                <th scope="col">
                  <span className="o-visually-hidden">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((item) => (
                <tr key={item.applicationId} data-testid="participant-row" data-arrived={isIn(item) ? "yes" : "no"}>
                  <td>
                    {item.pseudo}
                    {event.days.length > 1 && (
                      <span className="s-muted o-t-caption" data-testid="participant-day">
                        {" · "}
                        {item.dayDate ? formatDayDate(item.dayDate, { weekday: false }) : eventDaysLabels.wholeEvent}
                      </span>
                    )}
                  </td>
                  <td className="o-never-truncate">{item.vehicleLabel ?? "—"}</td>
                  <td>{item.zone?.code ?? "—"}</td>
                  <td>
                    {item.checkedInAt ? (
                      <span className="s-row">
                        <StatusBadge status="onsite" animated={false} />
                        <span className="s-muted o-t-caption">{formatDateTime(item.checkedInAt)}</span>
                      </span>
                    ) : (
                      <span className="s-muted">Attendu</span>
                    )}
                  </td>
                  <td>
                    {!item.checkedInAt && (
                      <Button
                        variant="plate"
                        icon="entry"
                        aria-label={`Pointer ${item.pseudo}`}
                        loading={busyId === item.applicationId}
                        onClick={() => void check(item.applicationId)}
                      >
                        Pointer
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={5} className="s-muted">
                    Aucun participant ne correspond.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {organizer && <AfterEvent reviews={loaderData.reviews} contests={loaderData.contests} />}
    </>
  );
}
