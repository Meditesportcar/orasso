import { Button, Chip, Counters, StatusBadge } from "@orasso/design-system/web";
import {
  type EventCard,
  type EventCounters,
  eventFormatLabels,
  type MyStaffEvent,
  type StructurePublic,
} from "@orasso/shared";
import { useParams } from "react-router";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { formatWhen } from "../lib/format";
import type { Route } from "./+types/orga-index";

export async function loader({ request, params }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const membership = me.memberships.find((m) => m.structureSlug === params.structure && m.status === "active");
  const structure = await apiOrThrow<StructurePublic>(
    request,
    `/structures/by-slug/${encodeURIComponent(params.structure)}`,
  );
  if (membership && membership.role !== "staff") {
    const events = await apiOrThrow<EventCard[]>(request, `/structures/${structure.id}/events`);
    const rows = await Promise.all(
      events.map(async (event) => {
        const counters = await api<EventCounters>(request, `/events/${event.id}/counters`);
        return {
          id: event.id,
          title: event.title,
          format: event.format,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          status: event.status,
          counters: counters.ok ? counters.data : null,
        };
      }),
    );
    return { organizer: true, rows };
  }
  const mine = await apiOrThrow<MyStaffEvent[]>(request, "/me/staff-events");
  return {
    organizer: false,
    rows: mine
      .filter((m) => m.structure.id === structure.id)
      .map((m) => ({
        id: m.event.id,
        title: m.event.title,
        format: m.event.format,
        startsAt: m.event.startsAt,
        endsAt: m.event.endsAt,
        status: "published" as const,
        counters: null,
      })),
  };
}

export default function OrgaIndex({ loaderData }: Route.ComponentProps) {
  const { organizer, rows } = loaderData;
  const base = `/orga/${useParams().structure}`;
  // Un seul bouton principal par écran : le tri du premier événement qui a des candidatures à trier.
  const primaryId = rows.find((r) => r.status === "published" && (r.counters?.pending ?? 0) > 0)?.id;
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Espace organisateur</div>
          <h1 className="s-title">Événements</h1>
        </div>
      </div>
      {rows.length === 0 && <p className="s-notice">Aucun événement pour l'instant.</p>}
      {rows.map((event) => (
        <section key={event.id} className="orga__panel" data-testid="orga-event">
          <div className="s-grow s-stack s-stack--tight">
            <div className="s-label o-t-label">{eventFormatLabels[event.format]}</div>
            <h2 className="s-h2">{event.title}</h2>
            <div className="o-t-meta s-muted">{formatWhen(event.startsAt, event.endsAt)}</div>
            {event.status === "draft" && <Chip>Brouillon</Chip>}
            {event.status === "cancelled" && <StatusBadge status="cancelled" />}
          </div>
          {organizer && event.counters && (
            <Counters
              variant="surface"
              size="site"
              items={[
                { value: event.counters.remaining ?? "∞", label: "places restantes" },
                { value: event.counters.accepted, label: "retenus" },
                { value: event.counters.pending, label: "à trier" },
                { value: event.counters.waitlisted, label: "liste d'attente" },
              ]}
            />
          )}
          <div className="s-row">
            {organizer && (
              <Button
                variant={event.id === primaryId ? "primary" : "secondary"}
                icon="check"
                href={`${base}/e/${event.id}/candidatures`}
              >
                Candidatures
              </Button>
            )}
            <Button variant="secondary" icon="live" href={`${base}/e/${event.id}/jour-j`}>
              Jour J et après
            </Button>
          </div>
        </section>
      ))}
    </>
  );
}
