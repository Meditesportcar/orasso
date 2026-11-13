import { actorKeyOfSpace } from "@orasso/shared";
import { Outlet } from "react-router";

import { CasquetteTabs } from "../components/casquette/CasquetteTabs";
import { ActorProvider } from "../lib/actor";
import { requireMe } from "../lib/api.server";
import type { Route } from "./+types/casquette";

// Les casquettes Média et Prestataire (lot R9h, T52) : elles gardent le layout `app` (la barre du passionné) et reçoivent une
// sous-navigation de casquette (`CasquetteTabs`, une rangée d'onglets collante) qui enveloppe `/app/media/*` et
// `/app/prestataire/*`. La casquette est portée par l'espace (T48) : `m:<id>` ou `v:<id>` (la ligne de `GET /me` → `personas`),
// jamais par un cookie. Sans casquette (la création du profil, pas encore de ligne), ni sous-navigation ni acteur : l'écran
// existant s'affiche tel quel.
export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const space = new URL(request.url).pathname.startsWith("/app/media") ? ("media" as const) : ("provider" as const);
  const persona = me.personas.find((p) => p.kind === space);
  const key = actorKeyOfSpace({ space, id: persona?.id });
  return {
    space,
    casquette: persona && key ? { key, name: persona.label, logoUrl: persona.logoUrl } : null,
  };
}

export default function CasquetteLayout({ loaderData }: Route.ComponentProps) {
  const { space, casquette } = loaderData;
  return (
    <ActorProvider casquette={casquette}>
      {casquette ? <CasquetteTabs space={space} casquette={casquette} /> : null}
      <Outlet />
    </ActorProvider>
  );
}
