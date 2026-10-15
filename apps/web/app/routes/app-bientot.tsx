import { Button } from "@orasso/design-system/web";
import { useLocation } from "react-router";

export function meta() {
  return [{ title: "Bientôt · Orasso" }, { name: "robots", content: "noindex" }];
}

const TITLES: Record<string, string> = { "/app/explorer": "Explorer", "/app/boite": "Boîte" };

// Sections de l'appli qui ne font pas partie du parcours n° 1 sur le site : page d'attente.
export default function Bientot() {
  const { pathname } = useLocation();
  return (
    <div className="s-stack">
      <h1 className="s-title">{TITLES[pathname] ?? "Bientôt"}</h1>
      <p className="s-notice">
        Cette section arrive bientôt sur le site. Pour l'instant, tout se passe dans Accès et Garage.
      </p>
      <div className="s-row">
        <Button variant="primary" icon="qr" href="/app/acces">
          Mes accès
        </Button>
        <Button variant="secondary" icon="vehicle" href="/app/garage">
          Mon garage
        </Button>
      </div>
    </div>
  );
}
