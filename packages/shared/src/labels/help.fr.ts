// Aide et Mon profil (lot M5, maquettes 7.2 et 7.3) : textes communs à l'appli et au site. Les délais et les seuils
// viennent des règles (liste d'attente, certification) : un chiffre ne s'écrit qu'une fois.

import type { MainProfile } from "../enums";
import { CERTIFICATION_MIN_PHOTOS } from "../garage";
import { gradeLabels, grades } from "../grades";
import { CERTIFICATION_MIN_GRADE } from "../rules/garage";
import { OFFER_DELAY_DAY, OFFER_DELAY_DEFAULT, OFFER_DELAY_EVE } from "../rules/waitlistDeadline";

const HOUR = 3_600_000;

/** Adresse de contact de l'équipe Orasso. */
export const CONTACT_EMAIL = "contact@orasso.fr";

export const helpLabels = {
  title: "Aide",
  subtitle: "Tutos, questions, nous écrire",
  replay: "Revoir le tuto",
  replayHint: "un par casquette",
  faq: "Questions fréquentes",
  write: "Nous écrire",
  writeTeam: "Écrire à l'équipe Orasso",
  writeTeamCaption: `Par e-mail : ${CONTACT_EMAIL}, réponse en général sous 24 h`,
  report: "Signaler un problème",
  reportCaption: "Dis-nous ce qui s'est passé ; ajoute une capture si tu veux",
  /** Sujets des e-mails préparés (la version de l'appli aide l'équipe). */
  writeSubject: (version: string) => `Question · Orasso ${version}`,
  reportSubject: (version: string, platform: string) => `Problème · Orasso ${version} · ${platform}`,
  reportBody: "Ce qui s'est passé :\n\nL'écran concerné :\n\n(Tu peux joindre une capture d'écran.)",
  /** Où sont passés les sanctions et l'export des données (ils ont quitté l'Aide). */
  movedNote: "Tes sanctions sont dans Profil › Compte, l'export de tes données dans Profil › Confidentialité.",
  movedNoteSite:
    "Tes sanctions sont dans Mon compte › Compte, l'export de tes données dans Mon compte › Confidentialité.",
  version: (v: string) => `Orasso ${v}`,
};

/** Ce que montre le tuto de chaque profil (carte « Revoir le tuto »). */
export const tutoReplayCaptions: Record<MainProfile, string> = {
  exhibitor: "Candidater, ton QR, le jour J",
  visitor: "Ton billet, le passeport, l'Explorer",
  pro: "Ta fiche, les remises, tes stats",
  organizer: "Créer, trier, accueillir",
  provider: "Tes missions, ta vitrine",
  media: "Accréditations, badge, contenus",
};

/** Questions fréquentes (maquette 7.3) : candidater, liste d'attente, QR et jour J, points, certification, floutage. */
export const helpFaq: readonly { id: string; q: string; a: string }[] = [
  {
    id: "candidater",
    q: "Comment candidater ?",
    a: "Sur la fiche de l'événement, touche « Candidater », choisis ton véhicule et envoie. L'organisateur trie les candidatures : tu reçois la réponse en notification et dans Sorties.",
  },
  {
    id: "attente",
    q: "Liste d'attente et délais",
    a: `Si une place se libère, tu es prévenu et tu as un délai pour l'accepter : ${OFFER_DELAY_DEFAULT / HOUR} h en général, ${OFFER_DELAY_EVE / HOUR} h la veille, ${OFFER_DELAY_DAY / HOUR} h le jour J. Passé ce délai, elle part au suivant. Tu peux te retirer sans pénalité jusqu'à la date indiquée sur ton ticket.`,
  },
  {
    id: "qr",
    q: "Mon QR et le jour J",
    a: "Ton QR d'accès est là dès que ta place est retenue, dans Sorties. Il marche sans réseau : présente-le à travers le pare-brise, le staff le scanne. Le jour J, il s'ouvre tout seul à l'ouverture de l'appli.",
  },
  {
    id: "points",
    q: "Points et grades",
    a: `Chaque sortie pointée à l'accueil rapporte des points, deux jours après l'événement. Une absence sans te retirer coûte un malus. Les grades (${grades.map((g) => gradeLabels[g]).join(", ")}) ouvrent des remises chez les pros partenaires.`,
  },
  {
    id: "certification",
    q: "La certification",
    a: `${CERTIFICATION_MIN_PHOTOS} photos, une description et le grade ${gradeLabels[CERTIFICATION_MIN_GRADE]} : demande-la depuis ton garage. L'équipe Orasso la valide à la main. Un ancien véhicule (vendu, souvenir, accidenté) ne peut pas être certifié.`,
  },
  {
    id: "floutage",
    q: "Le floutage des plaques",
    a: "Ta plaque est repérée et floutée sur chaque photo avant la publication ; tu peux aussi poser le cadre à la main. Le numéro reste privé : seule l'équipe organisatrice le voit.",
  },
];

/** « Changer de casquette » de Mon profil (maquette 7.2, correction de Damien) : un nom simple et ce que chacune ouvre. */
export const capLabels = {
  title: "Changer de casquette",
  active: "Active",
  /** La phrase d'en-tête, selon les casquettes de la personne. */
  intro(kinds: readonly string[]): string {
    if (kinds.includes("organizer"))
      return "Tu es aussi organisateur ? Passe sur ta casquette pour gérer tes événements : la barre du bas change avec elle.";
    if (kinds.length > 1) return "Passe d'une casquette à l'autre : la barre du bas change avec elle.";
    return "Organisateur, pro, prestataire ou média : chaque rôle a sa casquette, avec sa propre barre du bas.";
  },
  name: {
    fan: "Passionné",
    visitor: "Visiteur",
    organizer: "Organisateur",
    pro: "Pro",
    provider: "Prestataire",
    media: "Média",
    admin: "Administration",
    staff: "Staff",
  } as Record<string, string>,
  opens: {
    fan: "Tes sorties, ton garage, l'Explorer",
    visitor: "Tes billets, ton passeport, l'Explorer",
    organizer: "Tes événements, le tri, ton équipe",
    pro: "Ta fiche, le scanner des remises, tes stats",
    provider: "Tes missions, tes candidatures, ta vitrine",
    media: "Tes accréditations, tes contenus, ton agenda",
    admin: "Signalements, vérifications, réglages",
    staff: "L'accueil et le scan le jour J",
  } as Record<string, string>,
  become: "Devenir organisateur ou pro",
  joinTeam: "Rejoindre une équipe staff",
};
