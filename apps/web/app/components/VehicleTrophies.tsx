// Les trophées de la carte d'un véhicule, sur le site (lot R7l3, maquette R7.18 `vr_car`) : une ligne par podium de vote
// (« Plus belle japonaise · Rassemblement du Lydia · 10 nov. »), et « Partenaire : … » quand l'API renvoie `partner` (R7m1).
// Rien quand il n'y a ni l'un ni l'autre. Les trophées viennent de l'API ; aucune règle ici.
import { Chip, Icon } from "@orasso/design-system/web";
import { partnerOf, vehicleTrophyTexts as T, trophiesOf, trophyLine } from "@orasso/shared";

import { nowMs } from "../lib/clock";
import "../styles/votes-pass.css";

export function VehicleTrophies({ vehicle }: { vehicle: unknown }) {
  const at = new Date(nowMs());
  const lines = trophiesOf(vehicle).map((t) => trophyLine(t, at));
  const partner = partnerOf(vehicle);
  if (lines.length === 0 && !partner) return null;
  return (
    <section className="s-stack s-stack--tight" aria-labelledby="vehicle-trophies" data-testid="vehicle-trophies">
      {lines.length > 0 ? (
        <div className="s-row s-row--between">
          <h2 id="vehicle-trophies" className="s-h2">
            {T.title}
          </h2>
          <span className="o-t-caption s-muted">{T.byThePublic}</span>
        </div>
      ) : null}
      <ul className="vt-list">
        {lines.map((l) => (
          <li key={l.id} className="vt-row" data-testid="vehicle-trophy">
            <span className="vt-round">
              <Icon name="trophy" />
            </span>
            <span className="vt-row__text">
              <b className="o-never-truncate">{l.title}</b>
              <small>{l.sub}</small>
            </span>
            <Chip variant={l.first ? "accent" : undefined}>{l.rank}</Chip>
          </li>
        ))}
        {partner ? (
          <li>
            {partner.slug ? (
              <a className="vt-row" href={`/p/${partner.slug}`} data-testid="vehicle-partner">
                <span className="vt-round">
                  <Icon name="briefcase" />
                </span>
                <span className="vt-row__text">
                  <b className="o-never-truncate">{partner.title}</b>
                </span>
                <Icon name="next" />
              </a>
            ) : (
              <div className="vt-row" data-testid="vehicle-partner">
                <span className="vt-round">
                  <Icon name="briefcase" />
                </span>
                <span className="vt-row__text">
                  <b className="o-never-truncate">{partner.title}</b>
                </span>
              </div>
            )}
          </li>
        ) : null}
      </ul>
    </section>
  );
}
