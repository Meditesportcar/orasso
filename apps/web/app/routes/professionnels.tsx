import { Button, Icon, Plate, Reveal } from "@orasso/design-system/web";

import { originOf } from "../lib/api.server";
import type { Route } from "./+types/professionnels";

export function loader({ request }: Route.LoaderArgs) {
  return { origin: originOf(request) };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const origin = loaderData?.origin ?? "";
  const description =
    "Garages, préparateurs, detailing, covering, pièces : sois visible auprès des passionnés d'Orasso et offre une remise à tes clients selon leur grade. Gratuit jusqu'au 21 juin 2027.";
  return [
    { title: "Professionnels · Orasso" },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Orasso" },
    { property: "og:title", content: "Professionnels · Orasso" },
    { property: "og:description", content: description },
    { property: "og:url", content: `${origin}/professionnels` },
    { property: "og:image", content: `${origin}/og-image.png` },
  ];
}

const POINTS = [
  {
    icon: "place",
    title: "Être trouvé",
    text: "Une fiche visible dans l'annuaire des pros, avec ton adresse sur la carte, pour les passionnés de ta région.",
  },
  {
    icon: "qr",
    title: "Vérifier un grade en un scan",
    text: "Ton client montre le QR de son compte dans l'appli, tu lis son pseudo et son grade, et tu appliques la remise que tu as choisie. Rien d'autre n'est affiché.",
  },
  {
    icon: "chat",
    title: "Publier",
    text: "Annonce une offre ou un événement à ceux qui te suivent.",
  },
  {
    icon: "calendar",
    title: "Être présent aux événements",
    text: "Les organisateurs peuvent t'associer à leurs rassemblements : tes clients de demain y sont déjà.",
  },
] as const;

export default function Professionnels() {
  return (
    <div className="s-stack">
      <Reveal>
        <Plate as="section" className="s-hero" aria-labelledby="pro-title">
          <div className="o-t-label s-label">Professionnels</div>
          <h1 id="pro-title" className="s-title s-title--xl">
            Des clients qui vivent pour l'automobile.
          </h1>
          <p className="s-lead s-hero__lead">
            Orasso met en relation les commerces de l'automobile et la communauté qui participe aux événements. L'accès
            est gratuit jusqu'au 21 juin 2027 ; food trucks, barbiers, tatoueurs, photographes et animateurs restent
            gratuits.
          </p>
          <div className="s-row">
            <Button variant="primary" icon="phone" disabled>
              Les fiches pro ouvrent bientôt
            </Button>
          </div>
        </Plate>
      </Reveal>

      <section className="s-grid" aria-label="Ce que tu y gagnes">
        {POINTS.map((point) => (
          <Plate key={point.title} as="article" className="s-entry">
            <Icon name={point.icon} size={28} />
            <h2 className="s-tile__title">{point.title}</h2>
            <p className="s-entry__text">{point.text}</p>
          </Plate>
        ))}
      </section>

      <Plate as="section" kind="note" aria-labelledby="pro-soon">
        <h2 id="pro-soon" className="s-h2">
          En préparation
        </h2>
        <p className="s-entry__text">
          Cette page est une présentation. L'inscription des professionnels, l'annuaire et l'abonnement arrivent dans
          une prochaine version ; les tarifs ne sont pas encore fixés.
        </p>
      </Plate>
    </div>
  );
}
