import { Button, Icon, Plate, Reveal } from "@orasso/design-system/web";

import { originOf } from "../lib/api.server";
import type { Route } from "./+types/organisateurs";

export function loader({ request }: Route.LoaderArgs) {
  return { origin: originOf(request) };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const origin = loaderData?.origin ?? "";
  const description =
    "Orasso est l'outil des associations, clubs et circuits : événement créé par étapes, tri des candidatures, liste d'attente automatique, QR d'accès et accueil hors ligne. Gratuit.";
  return [
    { title: "Organisateurs · Orasso" },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Orasso" },
    { property: "og:title", content: "Organisateurs · Orasso" },
    { property: "og:description", content: description },
    { property: "og:url", content: `${origin}/organisateurs` },
    { property: "og:image", content: `${origin}/og-image.png` },
  ];
}

const FEATURES = [
  {
    icon: "calendar",
    title: "Créer par étapes",
    text: "Format, véhicules admis, places, public, admission, critères, avant-première des abonnés, règlement. Duplique un événement passé en un clic, ou programme « chaque premier dimanche du mois » une seule fois.",
  },
  {
    icon: "check",
    title: "Trier au clavier",
    text: "Une candidature à la fois avec de grandes photos, trois touches pour retenir, mettre en attente ou refuser, avec un motif. Vue liste, filtres et décisions en masse pour les gros volumes.",
  },
  {
    icon: "wait",
    title: "Liste d'attente automatique",
    text: "Une place se libère, elle est proposée au suivant, avec un délai raccourci la veille et le jour même. Vous ne gérez plus les désistements à la main.",
  },
  {
    icon: "qr",
    title: "QR signés, accueil hors ligne",
    text: "Chaque retenu reçoit un QR impossible à falsifier. Le staff scanne dans l'appli, même sans réseau : la liste est synchronisée avant l'ouverture.",
  },
  {
    icon: "live",
    title: "Le jour J en direct",
    text: "Arrivés et attendus par catégorie, staff présent, pointage manuel et par plaque, inscription express sur place.",
  },
  {
    icon: "grade",
    title: "Après l'événement",
    text: "Points et grades pour les participants, avis vérifiés avec droit de réponse, contestations traitées depuis votre espace.",
  },
] as const;

export default function Organisateurs() {
  return (
    <div className="s-stack">
      <Reveal>
        <Plate as="section" className="s-hero" aria-labelledby="orga-title">
          <div className="o-t-label s-label">Organisateurs</div>
          <h1 id="orga-title" className="s-title s-title--xl">
            Votre événement, de la candidature à l'entrée.
          </h1>
          <p className="s-lead s-hero__lead">
            Orasso remplace les formulaires, les tableaux de suivi et les listes papier. Il est conçu par un
            organisateur, pour les associations, les clubs et les circuits. Il est gratuit.
          </p>
          <div className="s-row">
            <Button variant="primary" icon="add" href="/app/structure/nouvelle">
              Créer ma structure
            </Button>
          </div>
        </Plate>
      </Reveal>

      <section className="s-grid s-grid--3" aria-label="Ce que fait Orasso">
        {FEATURES.map((feature) => (
          <Plate key={feature.title} as="article" className="s-entry">
            <Icon name={feature.icon} size={28} />
            <h2 className="s-tile__title">{feature.title}</h2>
            <p className="s-entry__text">{feature.text}</p>
          </Plate>
        ))}
      </section>

      <Plate as="section" aria-labelledby="orga-verif">
        <h2 id="orga-verif" className="s-h2">
          Une plateforme de clubs sérieux
        </h2>
        <p className="s-entry__text">
          N'importe qui peut créer une structure et préparer ses événements. Pour publier, la structure est vérifiée en
          deux étapes : votre numéro SIRET ou RNA est contrôlé automatiquement dans les registres publics, puis un
          justificatif (statuts, récépissé de déclaration, Kbis) est validé par l'équipe Orasso. Vous recevez le badge «
          Structure vérifiée », valable un an. Un club sérieux sans déclaration peut être validé à la main avec la pièce
          d'identité de son responsable, supprimée dès la validation.
        </p>
      </Plate>
    </div>
  );
}
