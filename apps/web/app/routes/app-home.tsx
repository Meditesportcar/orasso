import { Button } from "@orasso/design-system/web";

import { requireMe } from "../lib/api.server";
import type { Route } from "./+types/app-home";

export function meta() {
  return [{ title: "Mon compte · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  return { pseudo: me.profile.pseudo, counts: me.counts };
}

export default function AppHome({ loaderData }: Route.ComponentProps) {
  const { pseudo, counts } = loaderData;
  return (
    <div className="s-stack">
      <h1 className="s-title">Salut {pseudo}</h1>
      <div className="s-grid">
        <div className="s-card">
          <h2 className="s-h2">Mes accès</h2>
          <p className="s-muted">
            {counts.upcomingApplications} candidature{counts.upcomingApplications > 1 ? "s" : ""} à venir
          </p>
          <Button variant="primary" icon="qr" href="/app/acces">
            Voir mes accès
          </Button>
        </div>
        <div className="s-card">
          <h2 className="s-h2">Mon garage</h2>
          <p className="s-muted">
            {counts.vehicles} véhicule{counts.vehicles > 1 ? "s" : ""}
          </p>
          <Button variant="secondary" icon="vehicle" href="/app/garage">
            Ouvrir mon garage
          </Button>
        </div>
      </div>
    </div>
  );
}
