// « Votes » d'un événement, côté organisateur et staff (lot R7l2, maquette R7.16 `v-live`) : chaque vote avec son état, « Lancer
// le vote » et « Clore maintenant », les candidats d'un vote « à la main », le classement en direct pour l'équipe. Les
// droits sont ceux de l'API (propriétaire et co-organisateurs écrivent, le staff lit) ; l'écran n'ajoute aucune règle.

import type { EventOrganizer, MyStaffEvent, VehicleMake, VoteManage } from "@orasso/shared";
import { voteOrgaLabels as L } from "@orasso/shared";
import { OrgaVotesLive } from "../components/votes/OrgaVotesLive";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { formatWhen } from "../lib/format";
import type { Route } from "./+types/orga-evenement-votes";
import "../styles/votes-orga.css";

export function meta() {
  return [{ title: "Votes · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const membership = me.memberships.find((m) => m.structureSlug === params.structure && m.status === "active");
  if (!membership) throw new Response("Cet espace est réservé aux membres de la structure.", { status: 403 });
  const eventId = params.eventId;
  let event: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    published: boolean;
    zones: EventOrganizer["zones"];
  } | null = null;
  let organizer = false;
  if (membership.role !== "staff") {
    const full = await apiOrThrow<EventOrganizer>(request, `/events/${eventId}`);
    if (full.structure.id !== membership.structureId) throw new Response("Événement introuvable.", { status: 404 });
    organizer = true;
    event = {
      id: full.id,
      title: full.title,
      startsAt: full.startsAt,
      endsAt: full.endsAt,
      published: full.status === "published",
      zones: full.zones,
    };
  } else {
    // Le staff de la structure lit les votes de ses événements (D38 : lecture seule).
    const mine = await api<MyStaffEvent[]>(request, "/me/staff-events");
    const found = mine.ok ? mine.data.find((m) => m.event.id === eventId) : undefined;
    if (found)
      event = {
        id: found.event.id,
        title: found.event.title,
        startsAt: found.event.startsAt,
        endsAt: found.event.endsAt,
        published: true,
        zones: [],
      };
  }
  if (!event) throw new Response("Événement introuvable", { status: 404 });
  const manage = await api<VoteManage>(request, `/events/${eventId}/votes/manage`);
  const makes = organizer ? await api<VehicleMake[]>(request, "/vehicle-reference/makes") : null;
  return {
    event,
    organizer,
    manage: manage.ok ? manage.data : null,
    manageError: manage.ok ? null : manage.error.message,
    makes: makes?.ok ? makes.data : [],
  };
}

export default function OrgaEvenementVotes({ loaderData, params }: Route.ComponentProps) {
  const { event, organizer, manage, manageError, makes } = loaderData;
  const back = organizer ? `/orga/${params.structure}/e/${event.id}` : `/orga/${params.structure}/e/${event.id}/jour-j`;
  return (
    <div className="s-stack" data-testid="orga-votes">
      <div className="s-stack s-stack--tight">
        <a className="o-t-caption" href={back}>
          ← {event.title}
        </a>
        <div className="s-label o-t-label">{L.screenTitle}</div>
        <h1 className="s-title">{event.title}</h1>
        <div className="o-t-meta s-label">{formatWhen(event.startsAt, event.endsAt)}</div>
      </div>
      {manageError && !manage ? (
        <p className="s-notice s-notice--alert" role="alert">
          {manageError}
        </p>
      ) : null}
      <section className="orga__panel s-stack" aria-label={L.screenTitle}>
        <OrgaVotesLive
          eventId={event.id}
          eventEndsAt={event.endsAt}
          published={event.published}
          readOnly={!organizer}
          initial={manage}
          zones={event.zones}
          makes={makes}
        />
      </section>
    </div>
  );
}
