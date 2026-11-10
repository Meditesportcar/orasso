// Les partenaires du Profil (maquettes R7.12 et R7.20 `pq_pro`, lot R7m1). Lot R8b1 (maquette R8.1) : la ligne de logos disparaît de
// l'en-tête ; les partenaires sont le 4e compteur de la bande (« partenaire » / « partenaires », seulement quand il y en
// a). `partnersBandCell` donne la case de la bande ; `PartnersPanel` est la liste (visée par la case : `#partenaires`, sans
// JavaScript). Sur le profil d'un autre, un partenaire ouvre sa fiche, plusieurs ouvrent la liste. Sur mon profil (`mine`) :
// la liste, avec « Mettre fin » (confirmation : le pro est prévenu, les contenus déjà publiés gardent leur mention). Les
// partenaires d'un autre viennent de `GET /users/:pseudo` (vide pour un compte privé que je ne suis pas) ; les miens de
// `GET /me/partnerships`. Une panne de la lecture ne ressemble jamais à « aucun partenaire » : la case dit « – » et la liste
// montre le message et « Réessayer ».
import {
  partnershipLabels as L,
  type MyPartnership,
  networkLabels as N,
  type PartnerLogo,
  profileTabsLabels as PT,
} from "@orasso/shared";
import type { ReactNode } from "react";

import "../../styles/partnerships.css";
import { PersonAvatar } from "../People";
import { EndForm } from "../partnerships/EndForm";
import type { BandCell } from "./ProfileHead";

type Row = {
  key: string;
  id: string | null;
  name: string;
  logoUrl: string | null;
  slug: string;
  detail: string | null;
  /** Faux : la fiche du pro n'est plus visible (dépubliée, non vérifiée, titulaire suspendu) ; on peut encore y mettre fin. */
  available: boolean;
};

const dayFr = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" }).format(new Date(iso));

/** Les lignes à montrer : mes partenaires (`mine`) ou ceux du profil d'un autre. */
export function partnerRows(
  partners: PartnerLogo[] | null | undefined,
  mine: MyPartnership[] | null | undefined,
): Row[] {
  return mine
    ? mine.map((i) => ({
        key: i.id,
        id: i.id,
        name: i.pro.name,
        logoUrl: i.pro.logoUrl,
        slug: i.pro.slug,
        detail: i.available
          ? [`depuis le ${dayFr(i.since)}`, i.vehicle?.label].filter(Boolean).join(" · ")
          : [L.unavailablePro, `depuis le ${dayFr(i.since)}`].join(" · "),
        available: i.available,
      }))
    : (partners ?? []).map((p) => ({
        key: p.proId,
        id: null,
        name: p.name,
        logoUrl: p.logoUrl,
        slug: p.slug,
        detail: null,
        available: true,
      }));
}

/** L'ancre de la liste : la case « partenaires » de la bande y mène. */
export const PARTNERS_ANCHOR = "partenaires";

/**
 * La case « partenaires » de la bande de compteurs : `null` tant qu'il n'y a aucun partenaire (et pas de panne) ; « – » si leur
 * lecture a échoué (jamais « 0 ») ; un seul partenaire d'un autre ouvre sa fiche, sinon la liste.
 */
export function partnersBandCell({
  partners,
  mine,
  down = false,
}: {
  partners?: PartnerLogo[] | null;
  mine?: MyPartnership[] | null;
  down?: boolean;
}): BandCell | null {
  const rows = partnerRows(partners, mine);
  if (down) {
    return {
      key: "partenaires",
      value: null,
      label: N.partners(2),
      href: `#${PARTNERS_ANCHOR}`,
      testId: "profil-count-partenaires",
    };
  }
  if (!rows.length) return null;
  const only = rows[0];
  const direct = !mine && rows.length === 1 && only ? `/p/${only.slug}` : null;
  return {
    key: "partenaires",
    value: rows.length,
    label: N.partners(rows.length),
    href: direct ?? `#${PARTNERS_ANCHOR}`,
    testId: "profil-count-partenaires",
  };
}

/** La liste des partenaires (ouverte par la case de la bande), avec « Mettre fin » sur mon profil. */
export function PartnersPanel({
  partners,
  mine,
  busy = false,
  failure,
}: {
  partners?: PartnerLogo[] | null;
  /** Mes partenaires (`GET /me/partnerships`) : la liste avec « Mettre fin ». */
  mine?: MyPartnership[] | null;
  busy?: boolean;
  /** Panne de lecture : le message et « Réessayer », au-dessus des lignes. */
  failure?: ReactNode;
}) {
  const rows = partnerRows(partners, mine);
  if (!rows.length && !failure) return null;
  return (
    <section
      id={PARTNERS_ANCHOR}
      className="ptn-line pt-partners"
      aria-label={rows.length ? L.partnersLine(rows.length) : PT.partnersTitle}
      data-testid="partners-line"
    >
      <h2 className="s-h2">{rows.length ? L.partnersLine(rows.length) : PT.partnersTitle}</h2>
      {failure}
      <ul className="ptn-line__list">
        {rows.map((r) => (
          <li className="ptn-row" key={r.key} data-testid="partner-row">
            {r.available ? (
              <a className="ptn-row__head" href={`/p/${r.slug}`}>
                <PersonAvatar url={r.logoUrl} pseudo={r.name} size={40} />
                <span>
                  <b>{r.name}</b>
                  {r.detail && <small>{r.detail}</small>}
                </span>
              </a>
            ) : (
              <span className="ptn-row__head" data-testid="partner-unavailable">
                <PersonAvatar url={r.logoUrl} pseudo={r.name} size={40} />
                <span>
                  <b>{r.name}</b>
                  {r.detail && <small>{r.detail}</small>}
                </span>
              </span>
            )}
            {mine && r.id && <EndForm intent="partnership_end" id={r.id} name={r.name} busy={busy} />}
          </li>
        ))}
      </ul>
    </section>
  );
}
