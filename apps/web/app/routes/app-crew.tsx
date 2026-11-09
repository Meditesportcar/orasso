import { Button } from "@orasso/design-system/web";
import { type MyCrew, navLabels } from "@orasso/shared";

import { CrewRow } from "../components/Crews";
import { api, requireMe } from "../lib/api.server";
import type { Route } from "./+types/app-crew";

// Onglet Crew (lot R7a1, D38) : la place est prise, l'écran viendra du lot R7b2. En attendant, comme l'appli : avec un
// crew, sa ligne et « Ouvrir mon crew » (la fiche du crew) ; sans crew, « Rejoindre un crew » (le seul bouton principal)
// et « Créer un crew ». Mode A : bande ORASSO et barre d'onglets.
export function meta() {
  return [{ title: `${navLabels.crewTab.title} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireMe(request);
  const res = await api<MyCrew[]>(request, "/me/crews");
  return { crews: res.ok ? res.data : null, error: res.ok ? null : res.error.message };
}

export default function AppCrew({ loaderData }: Route.ComponentProps) {
  const { crews, error } = loaderData;
  const L = navLabels.crewTab;
  const first = crews?.[0];
  return (
    <div className="s-narrow s-stack" data-testid="crew-tab">
      <h1 className="s-title">{L.title}</h1>
      {error ? (
        <div className="s-stack" data-testid="load-error">
          <p className="s-error" role="alert">
            {error}
          </p>
          <Button variant="secondary" icon="undo" href="/app/crew">
            Réessayer
          </Button>
        </div>
      ) : null}
      {first ? (
        <div className="s-stack" data-testid="crew-tab-mine">
          <ul className="s-people">
            {crews?.map((crew) => (
              <CrewRow key={crew.id} crew={crew} />
            ))}
          </ul>
          <Button variant="primary" icon="crew" href={`/c/${first.slug}`} data-testid="crew-tab-open">
            {L.open}
          </Button>
        </div>
      ) : null}
      {crews && !first ? (
        <div className="s-stack" data-testid="crew-tab-none">
          <p className="s-notice">
            {L.none} {L.noneHint}
          </p>
          <Button variant="primary" icon="crew" href="/app/crews/rejoindre" data-testid="crew-tab-join">
            {L.join}
          </Button>
          <Button variant="secondary" icon="add" href="/app/crews" data-testid="crew-tab-create">
            {L.create}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
