// « Ses partenaires » sur la fiche d'un pro (lot R7m1, maquette R7.19 `pp_fiche`) : les passionnés à partenariat actif
// (pseudo, grade, voiture), chacun ouvre son profil. L'API décide ce qui s'y trouve : rien sans compte connecté ; un compte
// privé que la personne qui regarde ne suit pas : pseudo, photo et grade, sans voiture. Six au plus, le nombre total, et
// « Voir tout » (`/p/<slug>/partenaires`, page par page) quand il y en a davantage.
import { Button, Icon } from "@orasso/design-system/web";
import { gradeLabels, partnershipLabels as L, type PartnerOfPro } from "@orasso/shared";

import "../../styles/partnerships.css";
import { PersonAvatar } from "../People";

export function PartnersOfPro({ items, total, slug }: { items: PartnerOfPro[]; total?: number; slug?: string }) {
  if (!items.length) return null;
  return (
    <section className="s-stack" aria-labelledby="pro-member-partners" data-testid="pro-member-partners">
      <h2 id="pro-member-partners" className="s-h2">
        {L.partnersTitle}
        <span className="o-t-caption s-muted"> · {L.partnersCount(total ?? items.length)}</span>
      </h2>
      <ul className="ptn-people">
        {items.map((p) => (
          <li key={p.pseudo}>
            <a className="ptn-person" href={`/u/${encodeURIComponent(p.pseudo)}`} data-testid="pro-member-partner">
              <PersonAvatar url={p.avatarUrl} pseudo={p.pseudo} size={40} />
              <span>
                <b>{p.pseudo}</b>
                <small>{[gradeLabels[p.grade], p.vehicle?.label].filter(Boolean).join(" · ")}</small>
              </span>
              <Icon name="next" size={16} />
            </a>
          </li>
        ))}
      </ul>
      {slug && (total ?? items.length) > items.length && (
        <Button
          variant="secondary"
          icon="next"
          href={`/p/${encodeURIComponent(slug)}/partenaires`}
          data-testid="pro-member-partners-all"
        >
          {L.partnersSeeAll}
        </Button>
      )}
    </section>
  );
}
