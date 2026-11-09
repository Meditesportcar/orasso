// Ligne « Partenaires » sous les nombres du Profil (maquettes R7.12 et R7.20 `pq_pro`, lot R7m1) : les logos ronds et les noms
// des pros partenaires. Elle n'existe que s'il y a un partenaire actif. Sur le profil d'un autre : un partenaire ouvre sa
// fiche, plusieurs ouvrent la liste. Sur mon profil (`mine`) : la liste, avec « Mettre fin » (confirmation : le pro est
// prévenu, les contenus déjà publiés gardent leur mention). Les partenaires d'un autre viennent de `GET /users/:pseudo`
// (vide pour un compte privé que je ne suis pas) ; les miens de `GET /me/partnerships`.
import { Icon } from "@orasso/design-system/web";
import { partnershipLabels as L, type MyPartnership, type PartnerLogo } from "@orasso/shared";

import "../../styles/partnerships.css";
import { PersonAvatar } from "../People";
import { EndForm } from "../partnerships/EndForm";

type Row = {
  key: string;
  id: string | null;
  name: string;
  logoUrl: string | null;
  slug: string;
  detail: string | null;
};

const dayFr = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" }).format(new Date(iso));

export function PartnersLine({
  partners,
  mine,
  busy = false,
}: {
  partners?: PartnerLogo[] | null;
  /** Mes partenaires (`GET /me/partnerships`) : la liste avec « Mettre fin ». */
  mine?: MyPartnership[] | null;
  busy?: boolean;
}) {
  const rows: Row[] = mine
    ? mine.map((i) => ({
        key: i.id,
        id: i.id,
        name: i.pro.name,
        logoUrl: i.pro.logoUrl,
        slug: i.pro.slug,
        detail: [`depuis le ${dayFr(i.since)}`, i.vehicle?.label].filter(Boolean).join(" · "),
      }))
    : (partners ?? []).map((p) => ({
        key: p.proId,
        id: null,
        name: p.name,
        logoUrl: p.logoUrl,
        slug: p.slug,
        detail: null,
      }));
  if (!rows.length) return null;
  const head = (
    <>
      <span className="ptn-line__logos">
        {rows.slice(0, 3).map((r) => (
          <PersonAvatar key={r.key} url={r.logoUrl} pseudo={r.name} size={36} />
        ))}
      </span>
      <span className="ptn-line__text">
        <b>{L.partnersLine(rows.length)}</b>
        <small>{rows.map((r) => r.name).join(" · ")}</small>
      </span>
      <Icon name="next" size={16} />
    </>
  );
  const only = rows[0];
  if (!mine && rows.length === 1 && only) {
    return (
      <div className="ptn-line" data-testid="partners-line">
        <a className="ptn-line__head" href={`/p/${only.slug}`} aria-label={`${L.partnersLine(1)}, ${only.name}`}>
          {head}
        </a>
      </div>
    );
  }
  return (
    <details className="ptn-line" data-testid="partners-line">
      <summary aria-label={`${L.partnersLine(rows.length)}, ${rows.map((r) => r.name).join(", ")}`}>{head}</summary>
      <ul className="ptn-line__list">
        {rows.map((r) => (
          <li className="ptn-row" key={r.key} data-testid="partner-row">
            <a className="ptn-row__head" href={`/p/${r.slug}`}>
              <PersonAvatar url={r.logoUrl} pseudo={r.name} size={40} />
              <span>
                <b>{r.name}</b>
                {r.detail && <small>{r.detail}</small>}
              </span>
            </a>
            {mine && r.id && <EndForm intent="partnership_end" id={r.id} name={r.name} busy={busy} />}
          </li>
        ))}
      </ul>
    </details>
  );
}
