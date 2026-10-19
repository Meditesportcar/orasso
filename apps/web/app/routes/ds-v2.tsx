import {
  AppBar,
  BigTitle,
  Outlined,
  TabBar,
  type TabSetName,
  type ThemeId,
  tabSets,
  tokensV2Overlay,
} from "@orasso/design-system/web";
import { personaKindLabels } from "@orasso/shared";
import { useState } from "react";

// Section « v2 » de la page de recette /ds (lot 38) : les écarts de la surcouche de jetons avec leur raison, le contour
// sur photo et sur fond, la barre du haut v2, les grands titres sur une ligne et les six barres d'onglets.

/** Les neuf grands titres d'onglet du prototype, avec une étiquette de droite d'exemple. */
export const BIG_TITLES: ReadonlyArray<readonly [string, string]> = [
  ["Mon garage", "3 véhicules"],
  ["Mes sorties", "2 à venir"],
  ["Explorer", "Pyrénées-Orientales"],
  ["Mon profil", "Grade Pilote"],
  ["Missions", "4 près de toi"],
  ["Candidatures", "1 en attente"],
  ["Accréditations", "2 demandes"],
  ["Contenus", "12 publiés"],
  ["Événements", "3 brouillons"],
];

/** Barre de chaque profil, dans l'ordre du choix du profil (prototype `s-profil`). */
const BARS: ReadonlyArray<readonly [Exclude<TabSetName, "fan">, string]> = [
  ["exhibitor", personaKindLabels.fan],
  ["visitor", personaKindLabels.visitor],
  ["pro", personaKindLabels.pro],
  ["provider", personaKindLabels.provider],
  ["media", personaKindLabels.media],
  ["organizer", personaKindLabels.organizer],
];

function Bar({ set, label }: { set: Exclude<TabSetName, "fan">; label: string }) {
  const items = tabSets[set];
  const [active, setActive] = useState<string>(items[2]?.id ?? "");
  return (
    <figure className="ds-v2-bar" data-bar-set={set}>
      <figcaption className="o-t-label">{label}</figcaption>
      <TabBar tabs={items} active={active} onSelect={setActive} aria-label={`Barre ${label}`} />
    </figure>
  );
}

export function V2Content({ theme }: { theme: ThemeId }) {
  return (
    <div className="ds-stack">
      <h3 className="o-t-label ds-v2-h3">Jetons de la surcouche (tokens.v2.json)</h3>
      <ul className="ds-v2-tokens" data-testid="v2-tokens">
        {tokensV2Overlay.map((change) => {
          const value = (change.value as Record<string, string>)[theme];
          const isColor = change.group === "color";
          return (
            <li key={`${change.group}-${change.name}`} className="ds-v2-token">
              {isColor ? (
                <span className="ds-v2-swatch" style={{ background: value }} aria-hidden="true" />
              ) : (
                <span className="ds-v2-swatch ds-v2-swatch--fx" aria-hidden="true" />
              )}
              <span className="ds-v2-token__name o-t-meta">
                {change.kind === "added" ? "+ " : ""}
                {change.group}/{change.name}
              </span>
              <span className="ds-v2-token__why o-t-caption">
                {isColor && value ? `${value} · ` : ""}
                {change.why}
              </span>
            </li>
          );
        })}
      </ul>

      <h3 className="o-t-label ds-v2-h3">Contour : sur photo et sur le fond</h3>
      <div className="ds-row ds-top-align">
        <div className="ds-v2-photo" data-testid="v2-photo">
          <Outlined on="photo" className="ds-v2-photo__big o-t-poster-xl">
            J-6
          </Outlined>
          <Outlined on="photo" className="o-t-meta">
            19 h · ouverture
          </Outlined>
        </div>
        <div className="ds-v2-onbg" data-onbg data-testid="v2-onbg">
          <p className="o-t-poster-m">Nocturne de Canet</p>
          <p className="o-t-meta">Sam 17 oct · 19 h · Zone JDM</p>
        </div>
      </div>

      <h3 className="o-t-label ds-v2-h3">Barre du haut v2</h3>
      <div className="ds-phone">
        <AppBar kind="tab" inboxCount={2} />
        <AppBar kind="tab" persona={{ logoUrl: null, label: "MéditeSportCar" }} inboxOn />
        <AppBar kind="flow" title="Candidater" />
      </div>

      <h3 className="o-t-label ds-v2-h3">Grands titres sur une ligne (390 et 360 px)</h3>
      <div className="ds-scroll-x">
        <div className="ds-v2-titles">
          {([390, 360] as const).map((width) => (
            <div key={width} className="ds-v2-frame" style={{ width }} data-frame={width}>
              <span className="o-t-label ds-v2-frame__size">{width} px</span>
              {BIG_TITLES.map(([title, label]) => (
                <BigTitle key={title} title={title} label={label} level={2} />
              ))}
            </div>
          ))}
        </div>
      </div>

      <h3 className="o-t-label ds-v2-h3">Barres des six profils</h3>
      <div className="ds-scroll-x">
        <div className="ds-v2-bars">
          {BARS.map(([set, label]) => (
            <Bar key={set} set={set} label={label} />
          ))}
        </div>
      </div>
    </div>
  );
}
