// Lancer un rendez-vous au spot (lot R7i, maquette R7.9) : `/app/spot/nouveau`, `?crew=<id>` depuis l'onglet Spots d'un crew
// (audience préremplie). Mode B (en-tête de fiche). Les règles (12 h au plus, un seul actif, invités) sont dans l'API.
import { spotLabels as L, type SpotAudiences } from "@orasso/shared";
import { useEffect, useState } from "react";

import { FicheBar, ficheHandle } from "../components/FicheBar";
import { SpotNewForm } from "../components/spot/SpotNewForm";
import { api, requireMe } from "../lib/api.server";
import type { Route } from "./+types/app-spot-nouveau";
import "../styles/spot.css";
import "../styles/wizard.css";

export const handle = ficheHandle;

export function meta() {
  return [{ title: `${L.launch} · Orasso` }, { name: "robots", content: "noindex" }];
}

// Lot R7i, tour 2 : comme la page d'un rendez-vous, jamais gardée par le navigateur ni par un relais.
export const headers: Route.HeadersFunction = ({ parentHeaders }) => {
  const h = new Headers(parentHeaders);
  h.set("cache-control", "private, no-store");
  return h;
};

export async function loader({ request }: Route.LoaderArgs) {
  await requireMe(request);
  const res = await api<SpotAudiences>(request, "/me/spot-meetups/audiences");
  const crew = new URL(request.url).searchParams.get("crew");
  return res.ok ? { audiences: res.data, crew, error: null } : { audiences: null, crew, error: res.error.message };
}

export default function AppSpotNew({ loaderData }: Route.ComponentProps) {
  const { audiences, crew, error } = loaderData;
  // L'heure vient du navigateur : le formulaire se rend après l'hydratation (pas d'écart serveur / navigateur).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div className="s-stack">
      <FicheBar title={L.title} facts={L.subtitle} back="/app" closeLabel="Fermer" />
      <div className="spot-page">
        {error ? (
          <p role="alert" data-testid="spot-load-error">
            {error}
          </p>
        ) : audiences && mounted ? (
          <SpotNewForm audiences={audiences} crewParam={crew} />
        ) : null}
      </div>
    </div>
  );
}
