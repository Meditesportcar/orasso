// Un rendez-vous au spot (lot R7i, maquette R7.9) : `/app/spot/:id`. Mode B (en-tête de fiche). L'API décide qui voit quoi : un
// rendez-vous qu'on n'a pas le droit de voir répond 404, la page le dit sans rien révéler (ni lieu, ni auteur).
import { Button } from "@orasso/design-system/web";
import { spotLabels as L, type SpotMeetupView } from "@orasso/shared";
import { data } from "react-router";

import { FicheBar, ficheHandle } from "../components/FicheBar";
import { SpotDetail } from "../components/spot/SpotDetail";
import { api, requireMe } from "../lib/api.server";
import type { Route } from "./+types/app-spot";
import "../styles/spot.css";

export const handle = ficheHandle;

export function meta() {
  return [{ title: `${L.title} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireMe(request);
  const res = await api<SpotMeetupView>(request, `/spot-meetups/${params.id}`);
  if (res.ok) return data({ meetup: res.data, error: null });
  return data({ meetup: null, error: res.error.message }, { status: res.status === 404 ? 404 : res.status });
}

export default function AppSpot({ loaderData }: Route.ComponentProps) {
  const { meetup, error } = loaderData;
  return (
    <div className="s-stack">
      <FicheBar title={L.title} facts={L.subtitle} back="/app" closeLabel="Fermer" />
      {meetup ? (
        <SpotDetail initial={meetup} />
      ) : (
        <div className="spot-page" data-testid="spot-gone">
          <p role="alert">{error === L.unavailable || !error ? L.unavailable : error}</p>
          <Button variant="secondary" icon="add" href="/app/spot/nouveau" data-testid="spot-gone-launch">
            {L.launch}
          </Button>
        </div>
      )}
    </div>
  );
}
