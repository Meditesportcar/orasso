// Une ligne de « Pratique » sur le site (`.r8prow` de la maquette R8.12) : l'icône de la sorte, le titre (jamais coupé : il passe à la
// ligne), une ligne de détail et « Y aller ». Comme sur la fiche d'un événement, « Y aller » mène à Google Maps ou à Waze : un
// seul bouton qui déplie le choix (sans JavaScript non plus : un `<details>`). Partagée par le bloc et la page.
import { Button, Icon, type IconName } from "@orasso/design-system/web";
import { practicalTexts as L, type PracticalKind } from "@orasso/shared";

import { routeLinks } from "../../lib/directions";

export const kindIcon: Record<PracticalKind, IconName> = { fuel: "power", wash: "drop" };

export function GoMenu({
  title,
  lat,
  lng,
  primary = false,
  testId,
}: {
  title: string;
  lat: number;
  lng: number;
  /** Le bouton principal de la page (le lieu touché dans la carte) : « Y aller » moutarde. */
  primary?: boolean;
  testId?: string;
}) {
  const links = routeLinks({ lat, lng, addressLine: null, city: null });
  if (!links) return null;
  return (
    <details className="pq-go" data-testid={testId}>
      <summary
        className={`o-button o-t-button o-button--${primary ? "primary" : "secondary"} pq-go__btn`}
        aria-label={L.goA11y(title)}
        data-testid={testId ? `${testId}-go` : undefined}
      >
        <Icon name="nav" size={18} />
        <span className="o-button__label">{L.goThere}</span>
      </summary>
      <div className="pq-go__menu">
        <Button variant="secondary" icon="nav" href={links.maps} target="_blank" rel="noreferrer" data-testid="go-maps">
          {L.goMaps}
        </Button>
        <Button variant="secondary" icon="nav" href={links.waze} target="_blank" rel="noreferrer" data-testid="go-waze">
          {L.goWaze}
        </Button>
      </div>
    </details>
  );
}

export function PracticalRow({
  kind,
  title,
  detail,
  lat,
  lng,
  primary = false,
  selected = false,
  testId,
}: {
  kind: PracticalKind;
  title: string;
  detail: string;
  lat: number;
  lng: number;
  primary?: boolean;
  selected?: boolean;
  testId?: string;
}) {
  return (
    <div className={`pq-row${selected ? " is-on" : ""}`} data-testid={testId}>
      <span className="pq-row__pic">
        <Icon name={kindIcon[kind]} size={16} />
      </span>
      <span className="pq-row__text">
        <b className="o-t-body-strong">{title}</b>
        <small className="o-t-caption">{detail}</small>
      </span>
      <GoMenu title={title} lat={lat} lng={lng} primary={primary} testId={testId ? `${testId}-go` : undefined} />
    </div>
  );
}
