import type { MainProfile } from "../enums";

// Arrivée (lot 41) : textes exacts du prototype DA v2 (`s-profil`, `s-dept`, `s-nom`, morceaux `pf-t` / `data-for`).
// Tout au « tu », sans genre. Le site (`/inscription`) et l'appli lisent ici.

/** Une tuile du choix du profil : nom et sous-titre (grille de 3 × 2). */
export const mainProfileTiles: Record<MainProfile, { title: string; subtitle: string }> = {
  exhibitor: { title: "Exposant", subtitle: "J'ai un véhicule à montrer" },
  visitor: { title: "Visiteur", subtitle: "Je viens voir les autos" },
  pro: { title: "Pro de l'auto", subtitle: "Garage, prépa, detailing" },
  organizer: { title: "Organisateur", subtitle: "Asso, club, circuit" },
  provider: { title: "Prestataire", subtitle: "Food truck, animation, barbier, stand" },
  media: { title: "Média", subtitle: "Photo, vidéo, presse, YouTube…" },
};

export const arriveeLabels = {
  splashStart: "Commencer",
  alreadyAccount: "J'ai déjà un compte",
  next: "Continuer",
  close: "Fermer",
  profile: {
    title: "Tu viens comment ?",
    text: "Ton choix règle tes onglets. Tu pourras en cumuler d'autres plus tard, depuis Mon profil.",
    tabsLabel: "Ta barre d'onglets",
  },
  department: {
    title: "Ton coin",
    mapLabel: "Carte des départements : touche pour choisir",
    hint: "Touche la carte pour ajouter ou retirer un département.",
    empty: "Aucun département choisi",
    favorite: "favori",
    main: "principal",
    removeAria: "Retirer le département",
    more: "autres départements choisis",
  },
  identity: {
    title: "Qui es-tu ?",
    text: "Ton pseudo est public. Ton nom reste dans l'enveloppe.",
    pseudo: "Pseudo",
    firstName: "Prénom",
    lastName: "Nom",
    privacyTitle: "Ton nom et ton prénom sont privés",
    privacyShared: "Ils ne s'affichent jamais sur ton profil.",
    privacyEnd: "L'équipe Orasso aussi.",
    submit: "Voir comment ça marche",
    email: "E-mail",
    password: "Mot de passe",
  },
  credit: "Carte : svg-maps, Victor Cazanave (CC BY 4.0)",
  list: {
    open: "Choisir dans une liste",
    close: "Masquer la liste",
    label: "Liste des départements",
    // Lot M6 (maquette 8.2) : la liste en feuille à 90 % de la hauteur.
    title: "Tes départements",
    cancel: "Annuler",
    search: "Nom ou numéro",
    searchAria: "Chercher un département",
    count: (n: number) => (n === 0 ? "Aucun choisi" : n === 1 ? "1 choisi" : `${n} choisis`),
    firstIsFavorite: (tag: string) => `Le premier est ton ${tag}`,
    chosenSection: "Choisis",
    allSection: "Tous les départements",
    validate: (n: number) => `Valider (${n})`,
  },
  errors: {
    mainProfile: "Choisis ton profil.",
    departments: "Choisis au moins un département.",
    firstName: "Ton prénom est obligatoire.",
    lastName: "Ton nom est obligatoire.",
    tooMany: "Tu peux choisir 20 départements au plus.",
  },
  /**
   * Lot R3d (retour réel du 24/10) : sous un bouton principal grisé, une ligne dit ce qui manque, la première chose
   * seulement. Mêmes mots dans l'appli (arrivée) et sur le site (inscription, inscription express).
   */
  missing: {
    profile: "Choisis ton profil pour continuer.",
    departments: "Choisis au moins un département.",
    departmentsLink: "Retour à Ton coin",
    pseudo: "Choisis un pseudo.",
    pseudoInvalid: "Pseudo : 3 à 24 caractères, lettres, chiffres, « _ » ou « . ».",
    pseudoChecking: "Vérification du pseudo…",
    pseudoTaken: "Ce pseudo est déjà pris : choisis-en un autre.",
    firstName: "Indique ton prénom.",
    lastName: "Indique ton nom.",
    email: "Indique ton e-mail.",
    emailInvalid: "E-mail : l'adresse n'est pas complète.",
    password: (min: number, missing: number) => `Mot de passe : ${min} caractères au moins (il en manque ${missing}).`,
    passwordTooLong: (max: number) => `Mot de passe : ${max} caractères au plus.`,
    passwordsDiffer: "Les deux mots de passe sont différents.",
    terms: "Coche les conditions d'utilisation.",
  },
} as const;

/** Pourquoi on demande le département, selon le profil. */
export const departmentWhy: Record<MainProfile, string> = {
  exhibitor: "On s'en sert pour te montrer d'abord ce qui se passe près de chez toi, même sans GPS.",
  visitor: "On s'en sert pour te montrer d'abord ce qui se passe près de chez toi, même sans GPS.",
  pro: "On s'en sert pour montrer ta fiche aux passionnés du coin et te signaler les événements proches, même sans GPS.",
  organizer: "On s'en sert pour situer tes événements et te montrer ce qui se passe autour, même sans GPS.",
  provider: "On s'en sert pour te proposer d'abord les missions près de chez toi, même sans GPS.",
  media: "On s'en sert pour te montrer d'abord les événements à couvrir près de chez toi, même sans GPS.",
};

/** Consigne sous la carte, selon le profil. */
export const departmentHint: Record<MainProfile, string> = {
  exhibitor: "Touche les départements où tu sors : le premier choisi est ton favori.",
  visitor: "Touche les départements où tu sors : le premier choisi est ton favori.",
  pro: "Touche les départements où tu travailles : le premier choisi est celui de ton atelier.",
  organizer: "Touche les départements où tu organises : le premier choisi est ton département principal.",
  provider: "Touche les départements où tu acceptes des missions : le premier choisi est ton département principal.",
  media: "Touche les départements que tu couvres : le premier choisi est ton département principal.",
};

/** Libellé de la puce du premier département : « favori » ou « principal ». */
export const departmentFirstTag: Record<MainProfile, string> = {
  exhibitor: "favori",
  visitor: "favori",
  pro: "principal",
  organizer: "principal",
  provider: "principal",
  media: "principal",
};

/** Indice sous le champ pseudo, selon le profil. */
export const pseudoHint: Record<MainProfile, string> = {
  exhibitor: "C'est lui qu'on voit sur ton profil, au tri et au scan.",
  visitor: "C'est lui qu'on voit sur ton profil et au scan.",
  pro: "C'est lui qu'on voit sur ton profil.",
  organizer: "C'est lui qu'on voit sur ton profil et dans ton équipe.",
  provider: "C'est lui qu'on voit sur ton profil ; tes candidatures portent le nom de ta prestation.",
  media: "C'est lui qu'on voit sur ton profil ; tes demandes portent le nom de ton média.",
};

/**
 * Qui peut voir le nom et le prénom, selon le profil (milieu de la note « privés »). Conforme à docs/01 (l'organisateur
 * voit les inscrits à ses événements et les abonnés de sa structure, pour la sécurité) : jamais « seulement en cas de
 * souci ». Un profil sans événement à rejoindre (pro, organisateur) garde la phrase sur ce que montre sa fiche.
 */
const seenByOrganizers =
  "Les équipes organisatrices des événements où tu t'inscris et des structures que tu suis peuvent les voir, pour la sécurité.";
export const namePrivacy: Record<MainProfile, string> = {
  exhibitor: seenByOrganizers,
  visitor: seenByOrganizers,
  pro: `Ta fiche montre le nom de ton atelier, jamais le tien. ${seenByOrganizers}`,
  organizer: `Tes événements montrent le nom de ta structure, jamais le tien. ${seenByOrganizers}`,
  provider:
    "Les équipes organisatrices des événements où tu interviens et des structures que tu suis peuvent les voir, pour la sécurité.",
  media:
    "Les équipes organisatrices des événements où tu interviens et des structures que tu suis peuvent les voir, pour la sécurité.",
};

/** Les départements d'outre-mer : absents de la carte, présents dans la liste. */
export const overseasDepartmentNames: Record<string, string> = {
  "971": "Guadeloupe",
  "972": "Martinique",
  "973": "Guyane",
  "974": "La Réunion",
  "976": "Mayotte",
};

/** Après l'arrivée : créer sa casquette (ou ajouter sa voiture) ; « Plus tard » laisse la barre de base. */
export const pendingLabels = {
  kicker: "Termine ta fiche",
  later: "Plus tard",
  pro: {
    title: "Crée ta fiche pro",
    caption: "Les passionnés du coin te trouvent, tes remises s'affichent.",
    cta: "Créer ma fiche pro",
  },
  organizer: {
    title: "Crée ta structure",
    caption: "Asso, club ou circuit : pour organiser des événements.",
    cta: "Créer ma structure",
  },
  provider: {
    title: "Crée ton profil prestataire",
    caption: "Pour candidater aux missions des événements.",
    cta: "Créer mon profil",
  },
  media: {
    title: "Crée ton profil média",
    caption: "Pour demander des accréditations et publier tes contenus.",
    cta: "Créer mon profil média",
  },
  vehicle: {
    title: "Ajoute ta voiture",
    caption: "Tu en as besoin pour candidater. Sans véhicule, tu as la barre du visiteur.",
    cta: "Ajouter ma voiture",
  },
  barNote: "Dès que c'est fait, ta barre d'onglets s'affiche.",
} as const;
