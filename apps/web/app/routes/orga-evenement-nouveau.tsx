import type { Category, StructureOrganizer, VehicleMake } from "@orasso/shared";

import { EventWizard } from "../components/EventWizard";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import type { Route } from "./+types/orga-evenement-nouveau";

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
    api<Category[]>(request, "/vehicle-reference/categories"),
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
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Événements</div>
          <h1 className="s-title">Nouvel événement</h1>
        </div>
      </div>
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
