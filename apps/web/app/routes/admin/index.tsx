// Administration (lot 33) : accueil, toutes les files et leurs compteurs (docs/02 « page d'accueil avec toutes les
// files »). Une tuile mène à sa page. Réservée au super admin (le modérateur est renvoyé vers les signalements).
import { type AdminOverview, adminOverviewTiles, adminTexts } from "@orasso/shared";

import { requireSuperAdmin } from "../../lib/admin.server";
import { apiOrThrow } from "../../lib/api.server";
import type { Route } from "./+types/index";

export function meta() {
  return [{ title: "Administration · Orasso" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireSuperAdmin(request);
  return { overview: await apiOrThrow<AdminOverview>(request, "/admin/overview") };
}

export default function AdminHome({ loaderData }: Route.ComponentProps) {
  const { overview } = loaderData;
  const total = adminOverviewTiles.reduce((n, t) => n + overview[t.key], 0);
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Administration</div>
          <h1 className="s-title">Accueil</h1>
          <p className="s-muted">{total ? adminTexts.overview : adminTexts.overviewEmpty}</p>
        </div>
      </div>
      <div className="adm-tiles" data-testid="admin-overview">
        {adminOverviewTiles.map((t) => {
          const n = overview[t.key];
          return (
            <a
              key={t.key}
              href={t.href}
              className={n ? "adm-tile" : "adm-tile adm-tile--empty"}
              data-testid={`tile-${t.key}`}
            >
              <span className="o-t-label">{t.label}</span>
              <span className="adm-tile__count s-title">{n}</span>
            </a>
          );
        })}
      </div>
    </>
  );
}
