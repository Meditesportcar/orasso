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
    privacyEnd: "L'équipe Orasso aussi, pour la sécurité.",
    submit: "Voir comment ça marche",
    email: "E-mail",
    password: "Mot de passe",
  },
  credit: "Carte : Victor Cazanave, CC BY 4.0",
  errors: {
    mainProfile: "Choisis ton profil.",
    departments: "Choisis au moins un département.",
    firstName: "Ton prénom est obligatoire.",
    lastName: "Ton nom est obligatoire.",
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

/** Qui peut voir le nom et le prénom, selon le profil (début de la note « privés »). */
export const namePrivacy: Record<MainProfile, string> = {
  exhibitor: "Seule l'équipe organisatrice d'un événement où tu vas peut les voir, et seulement en cas de souci.",
  visitor: "Seule l'équipe organisatrice d'un événement où tu vas peut les voir, et seulement en cas de souci.",
  pro: "Ta fiche montre le nom de ton atelier, jamais le tien.",
  organizer: "Tes événements montrent le nom de ta structure, jamais le tien.",
  provider: "Seule l'équipe organisatrice d'un événement où tu interviens peut les voir, et seulement en cas de souci.",
  media: "Seule l'équipe organisatrice d'un événement où tu interviens peut les voir, et seulement en cas de souci.",
};
