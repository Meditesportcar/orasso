import type { CategoryOption, StructureOrganizer, VehicleMake } from "@orasso/shared";

import { EventWizard } from "../components/EventWizard";
import { FicheBar, ficheHandle } from "../components/FicheBar";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import type { Route } from "./+types/orga-evenement-nouveau";

// Lot M7 : fiche ou parcours, mode B (en-tête de fiche, sans bande ni barre d'onglets).
export const handle = ficheHandle;

export function meta() {
  return [{ title: "Nouvel événement · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const membership = me.memberships.find((m) => m.structureSlug === params.structure && m.status === "active");
  if (!membership || membership.role === "staff") {
    throw new Response("Réservé aux organisateurs de la structure.", { status: 403 });
  }
  const [structure, categories, makes] = await Promise.all([
    apiOrThrow<StructureOrganizer>(request, `/structures/${membership.structureId}`),
    api<CategoryOption[]>(request, "/vehicle-reference/categories?paused=1"),
    api<VehicleMake[]>(request, "/vehicle-reference/makes"),
  ]);
  return {
    structure: {
      id: structure.id,
      slug: structure.slug,
      name: structure.name,
      followers: structure.followersCount ?? null,
      verified: structure.verified,
    },
    categories: categories.ok ? categories.data : [],
    makes: makes.ok ? makes.data : [],
  };
}

export default function NouvelEvenement({ loaderData }: Route.ComponentProps) {
  const { structure, categories, makes } = loaderData;
  return (
    <>
      <FicheBar title="Nouvel événement" back={`/orga/${structure.slug}`} />
      <EventWizard
        structureId={structure.id}
        structureSlug={structure.slug}
        structureName={structure.name}
        followers={structure.followers}
        verified={structure.verified}
        categories={categories}
        makes={makes}
      />
    </>
  );
}
