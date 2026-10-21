import {
  type Category,
  type EventOrganizer,
  eventResumeStep,
  eventWizardStepOf,
  initialEventDraft,
  type StructureOrganizer,
  type VehicleMake,
} from "@orasso/shared";

import { EventWizard } from "../components/EventWizard";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import type { Route } from "./+types/orga-evenement-modifier";

export function meta() {
  return [{ title: "Modifier l'événement · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const membership = me.memberships.find((m) => m.structureSlug === params.structure && m.status === "active");
  if (!membership || membership.role === "staff") {
    throw new Response("Réservé aux organisateurs de la structure.", { status: 403 });
  }
  const [structure, event, categories, makes] = await Promise.all([
    apiOrThrow<StructureOrganizer>(request, `/structures/${membership.structureId}`),
    apiOrThrow<EventOrganizer>(request, `/events/${params.eventId}`),
    api<Category[]>(request, "/vehicle-reference/categories"),
    api<VehicleMake[]>(request, "/vehicle-reference/makes"),
  ]);
  if (event.structure.id !== structure.id) throw new Response("Événement introuvable.", { status: 404 });
  // Une copie (duplication) encore en brouillon s'ouvre sur le premier temps : on y change d'abord la date.
  const copy = Boolean(event.parentEventId) && event.status === "draft";
  const wanted = eventWizardStepOf(new URL(request.url).searchParams.get("temps")) ?? (copy ? "type" : null);
  return {
    structure: {
      id: structure.id,
      slug: structure.slug,
      name: structure.name,
      followers: structure.followersCount ?? null,
      verified: structure.verified,
    },
    event,
    // Lot 53 : un brouillon rouvre au premier temps incomplet (jamais après l'affiche s'il n'en a pas ; le navigateur
    // affine avec le temps atteint) ; `?temps=lieu` choisit le temps.
    initialStep: eventResumeStep(initialEventDraft(new Date(), event), event.status === "draft", wanted),
    stepWanted: wanted !== null,
    categories: categories.ok ? categories.data : [],
    makes: makes.ok ? makes.data : [],
  };
}

export default function ModifierEvenement({ loaderData }: Route.ComponentProps) {
  const { structure, event, categories, makes, initialStep, stepWanted } = loaderData;
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Modifier</div>
          <h1 className="s-title">{event.title}</h1>
        </div>
      </div>
      <EventWizard
        key={event.id}
        structureId={structure.id}
        structureSlug={structure.slug}
        structureName={structure.name}
        followers={structure.followers}
        verified={structure.verified}
        categories={categories}
        makes={makes}
        event={event}
        initialStep={initialStep}
        stepWanted={stepWanted}
      />
    </>
  );
}
