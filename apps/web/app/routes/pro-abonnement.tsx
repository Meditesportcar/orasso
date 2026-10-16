// Espace pro, abonnement (`/pro/<slug>/abonnement`) : EN PRÉSENTATION. Aucun prix, aucun paiement, aucun lien de
// paiement (docs/01 : gratuit jusqu'au 21 juin 2027, tarifs « en discussion »). L'abonnement ne se vendra que sur le
// site, jamais dans l'appli.
import { Chip, Icon, Plate } from "@orasso/design-system/web";
import { PRO_FREE_UNTIL_LABEL, type ProOwner } from "@orasso/shared";

import { apiOrThrow } from "../lib/api.server";
import type { Route } from "./+types/pro-abonnement";

export function meta() {
  return [{ title: "Abonnement · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return { pro: await apiOrThrow<ProOwner>(request, "/me/pro") };
}

const FULL = [
  "Fiche complète : photos, horaires, contact, réseaux",
  "Mise en avant dans la découverte",
  "Remises par grade avec le lecteur de QR de compte",
  "Publications à tes abonnés",
  "Statistiques : vues, clics, abonnés, remises utilisées",
  "Bouton « garage favori »",
] as const;

export default function ProAbonnement({ loaderData }: Route.ComponentProps) {
  const { pro } = loaderData;
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Espace pro</div>
          <h1 className="s-title">Abonnement</h1>
        </div>
        <Chip variant="accent" data-testid="subscription-state">
          {pro.subscription.label}
        </Chip>
      </div>

      <Plate as="section" className="s-stack" aria-labelledby="offer-title" data-testid="subscription">
        <h2 id="offer-title" className="s-h2">
          L'offre Pro
        </h2>
        <p className="s-lead">
          Toutes les fonctions sont gratuites jusqu'au {PRO_FREE_UNTIL_LABEL}. Les tarifs seront annoncés avant cette
          date ; rien n'est à payer aujourd'hui.
        </p>
        <ul className="s-ticks">
          {FULL.map((line) => (
            <li key={line}>
              <Icon name="check" size={18} /> {line}
            </li>
          ))}
        </ul>
      </Plate>

      <Plate as="section" kind="note" aria-labelledby="after-title">
        <h2 id="after-title" className="s-h2">
          Après le {PRO_FREE_UNTIL_LABEL}
        </h2>
        <p className="s-entry__text">
          Une fiche de base gratuite (nom, activité, ville) reste dans l'annuaire. L'abonnement débloque la fiche
          complète, la mise en avant, les remises avec le lecteur de QR, les publications et les statistiques. Il se
          souscrira ici, sur le site : jamais dans l'appli.
        </p>
        <p className="o-t-caption s-muted">Page de présentation : aucun paiement n'est possible pour l'instant.</p>
      </Plate>
    </>
  );
}
