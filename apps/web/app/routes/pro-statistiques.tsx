// Espace pro, statistiques (`/pro/<slug>/statistiques`, docs/01) : vues de la fiche, clics « appeler » et « itinéraire »,
// abonnés, remises utilisées (scans du QR de compte).
import { Chip, Counters, Plate } from "@orasso/design-system/web";
import { gradeLabels, grades, type ProOwner, type ProStats } from "@orasso/shared";

import { apiOrThrow } from "../lib/api.server";
import { formatDayShort } from "../lib/format";
import type { Route } from "./+types/pro-statistiques";

export function meta() {
  return [{ title: "Statistiques · Orasso" }, { name: "robots", content: "noindex" }];
}

const RANGES = [7, 30, 90] as const;

export async function loader({ request }: Route.LoaderArgs) {
  const pro = await apiOrThrow<ProOwner>(request, "/me/pro");
  const asked = Number(new URL(request.url).searchParams.get("jours"));
  const days = (RANGES as readonly number[]).includes(asked) ? asked : 30;
  // Fiche de base (après le 21/06/2027, sans abonnement actif) : statistiques réservées aux pros abonnés (lot 21).
  if (pro.visibility.hidden.stats) return { pro, stats: null };
  const stats = await apiOrThrow<ProStats>(request, `/pros/${pro.id}/stats?days=${days}`);
  return { pro, stats };
}

export default function ProStatistiques({ loaderData }: Route.ComponentProps) {
  const { stats } = loaderData;
  if (!stats) {
    return (
      <>
        <div className="orga__head">
          <div>
            <div className="s-label o-t-label">Espace pro</div>
            <h1 className="s-title">Statistiques</h1>
          </div>
        </div>
        <p className="s-notice" data-testid="stats-locked">
          Les statistiques sont réservées aux pros abonnés.
        </p>
      </>
    );
  }
  const peak = Math.max(1, ...stats.series.map((d) => d.views));
  const used = grades.filter((g) => stats.discountsByGrade[g]);
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Espace pro</div>
          <h1 className="s-title">Statistiques</h1>
        </div>
        <nav className="s-row" aria-label="Période">
          {RANGES.map((r) => (
            <a key={r} href={`?jours=${r}`} aria-current={stats.days === r ? "true" : undefined}>
              <Chip selected={stats.days === r}>{r} jours</Chip>
            </a>
          ))}
        </nav>
      </div>

      <Counters
        variant="surface"
        size="site"
        items={[
          { value: stats.views, label: "vues de la fiche" },
          { value: stats.calls, label: "clics « appeler »" },
          { value: stats.routes, label: "clics « itinéraire »" },
          { value: stats.followers, label: "abonnés" },
          { value: stats.discounts, label: "remises utilisées" },
        ]}
        data-testid="pro-stats"
      />

      <section className="orga__panel s-stack" aria-labelledby="views-title">
        <h2 id="views-title" className="s-h2">
          Vues par jour
        </h2>
        <div className="s-bars" role="img" aria-label={`Vues de la fiche sur ${stats.days} jours`}>
          {stats.series.map((d) => (
            <div
              key={d.day}
              className="s-bars__col"
              title={`${formatDayShort(`${d.day}T12:00:00+02:00`)} : ${d.views}`}
            >
              <div className="s-bars__bar" style={{ height: `${Math.max(2, (d.views / peak) * 100)}%` }} />
            </div>
          ))}
        </div>
      </section>

      <section className="orga__panel s-stack" aria-labelledby="discounts-title" data-testid="pro-stats-discounts">
        <h2 id="discounts-title" className="s-h2">
          Remises utilisées
        </h2>
        {used.length === 0 ? (
          <p className="s-muted">
            Aucune remise utilisée sur cette période. Chaque scan valide du QR de compte d'un client qui a droit à une
            remise est compté ici.
          </p>
        ) : (
          <ul className="s-discounts">
            {used.map((g) => (
              <li key={g} className="s-discounts__on">
                <span className="o-t-label">{gradeLabels[g]}</span>
                <strong className="o-t-number">{stats.discountsByGrade[g]}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Plate as="section" kind="note">
        <p className="s-muted">
          Tes propres visites de ta fiche ne sont pas comptées. Pendant la période gratuite, les statistiques sont
          visibles pour tous les pros.
        </p>
      </Plate>
    </>
  );
}
