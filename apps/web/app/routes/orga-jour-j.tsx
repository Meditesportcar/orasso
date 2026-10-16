import { Button, Chip, Counters, StatusBadge, TextField } from "@orasso/design-system/web";
import type {
  CheckinListItem,
  CheckinResult,
  EventOrganizer,
  EventReviews,
  LiveCounters,
  MalusContestView,
  MyStaffEvent,
} from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { AfterEvent } from "../components/AfterEvent";
import { apiFetch } from "../lib/api.client";
import { api } from "../lib/api.server";
import { formatDateTime, formatWhen } from "../lib/format";
import { useChannel } from "../lib/useChannel";
import type { Route } from "./+types/orga-jour-j";

export function meta() {
  return [{ title: "Jour J · Orasso" }, { name: "robots", content: "noindex" }];
}

type EventInfo = { id: string; title: string; startsAt: string; endsAt: string };
type PlateOutcome = { matched: (CheckinResult & { plate: string })[]; unmatched: string[] };

export async function loader({ request, params }: Route.LoaderArgs) {
  const eventId = params.eventId;
  let event: EventInfo | null = null;
  let organizer = false;
  const full = await api<EventOrganizer>(request, `/events/${eventId}`);
  if (full.ok) {
    organizer = true;
    event = { id: full.data.id, title: full.data.title, startsAt: full.data.startsAt, endsAt: full.data.endsAt };
  } else {
    const mine = await api<MyStaffEvent[]>(request, "/me/staff-events");
    const found = mine.ok ? mine.data.find((m) => m.event.id === eventId) : undefined;
    if (found)
      event = {
        id: found.event.id,
        title: found.event.title,
        startsAt: found.event.startsAt,
        endsAt: found.event.endsAt,
      };
  }
  if (!event) throw new Response("Événement introuvable", { status: 404 });
  const list = await api<CheckinListItem[]>(request, `/events/${eventId}/checkins`);
  const live = organizer ? await api<LiveCounters>(request, `/events/${eventId}/live`) : null;
  // Après l'événement (organisateur) : avis et droit de réponse, contestations de malus.
  const reviews = organizer ? await api<EventReviews>(request, `/events/${eventId}/reviews`) : null;
  const contests = organizer ? await api<MalusContestView[]>(request, `/events/${eventId}/malus-contests`) : null;
  return {
    event,
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
  const { event, organizer, listError } = loaderData;
  const [items, setItems] = useState<CheckinListItem[]>(loaderData.items);
  const [live, setLive] = useState<LiveCounters | null>(loaderData.live);
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

  const refetch = useCallback(async () => {
    const res = await apiFetch<CheckinListItem[]>(`/events/${event.id}/checkins`);
    if (res.ok) setItems(res.data);
  }, [event.id]);

  // Direct : les compteurs arrivent par WebSocket, la liste se rafraîchit juste après (autres appareils du staff).
  useChannel(organizer ? `event:${event.id}:live` : null, (m) => {
    if (m.type === "live") setLive(m.payload as LiveCounters);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void refetch(), 400);
  });
  useChannel(!organizer ? `event:${event.id}:access` : null, () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void refetch(), 400);
  });

  const arrived = items.filter((i) => i.checkedInAt).length;
  const shown = items.filter((i) => {
    if (filter === "arrived" && !i.checkedInAt) return false;
    if (filter === "expected" && i.checkedInAt) return false;
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
              ]
            : [
                { value: arrived, label: "arrivés" },
                { value: items.length - arrived, label: "attendus" },
              ]
        }
      />

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
                <tr
                  key={item.applicationId}
                  data-testid="participant-row"
                  data-arrived={item.checkedInAt ? "yes" : "no"}
                >
                  <td>{item.pseudo}</td>
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
