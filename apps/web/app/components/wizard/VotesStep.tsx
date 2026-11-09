// Temps « Votes du public » de l'assistant du site (lot R7l2, maquette R7.15 `vp_list`) : les votes prévus de l'événement,
// « Toutes catégories » d'office, « Ajouter un vote ». Chaque vote est enregistré à part par l'API (l'étape n'est jamais
// bloquante pour publier) ; elle a besoin de l'événement enregistré (un brouillon l'est dès le premier temps).
import type { EventZone, VehicleMake } from "@orasso/shared";
import { voteOrgaLabels as L } from "@orasso/shared";
import { OrgaVoteList } from "../votes/OrgaVoteList";

export function VotesStep({
  eventId,
  eventEndsAt,
  zones,
  makes,
}: {
  eventId: string | null;
  eventEndsAt: string | null;
  zones: readonly EventZone[];
  makes: readonly VehicleMake[];
}) {
  if (!eventId)
    return (
      <p className="s-notice" data-testid="wizard-votes-needs-event">
        {L.needsEvent}
      </p>
    );
  return <OrgaVoteList eventId={eventId} eventEndsAt={eventEndsAt} zones={zones} makes={makes} />;
}
