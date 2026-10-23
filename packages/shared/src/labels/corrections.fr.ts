// Lot 36 : libellés des corrections demandées par Damien après l'essai de l'APK de référence (retours du 18/10/2026).
// Site et appli lisent les mêmes textes.
import type { RegistrationBlock } from "../rules/registrationBlock";

/** Raison affichée quand on ne peut pas candidater (`registrationBlock`). `when` formate une date (heure de Paris). */
export function registrationBlockText(block: RegistrationBlock, when: (iso: string) => string): string {
  switch (block.code) {
    case "draft":
      return "Brouillon : cet événement n'est pas encore publié.";
    case "cancelled":
      return "Cet événement est annulé.";
    case "ended":
      return "Événement terminé. Les participants pointés à l'entrée peuvent laisser leur avis pendant une semaine.";
    case "invite_only":
      return "Cet événement est sur invitation : seule une invitation de l'équipe organisatrice permet d'y participer.";
    case "locked": {
      const h = block.offsetMinutes / 60;
      const delay = Number.isInteger(h) ? `${h} h` : `${block.offsetMinutes} min`;
      return `Inscriptions closes depuis le ${when(block.at)} : ${delay} avant le début, la liste d'accès est figée pour le staff de l'entrée.`;
    }
    case "preview":
      return `Avant-première en cours, réservée aux abonnés de l'organisation${block.highGrades ? " et aux hauts grades" : ""}. Ouverture à tous le ${when(block.opensAt)}.`;
    case "not_open":
      return `Les candidatures ouvrent le ${when(block.opensAt)}.`;
  }
}

/** Événement complet : la candidature reste possible et passe par la liste d'attente. */
export const registrationFullText = "Complet : ta candidature passera par la liste d'attente.";

/** Fin de l'assistant d'événement : trois choix pour un brouillon (Publier, Garder en brouillon, Aperçu). */
export const wizardEndLabels = {
  publish: "Publier",
  keepDraft: "Garder en brouillon",
  preview: "Aperçu",
  previewHint: "La page publique telle que les passionnés la verront, en lecture seule.",
  publishNeedsVerified: "Ta structure n'est pas encore vérifiée : tu peux garder ce brouillon, pas encore le publier.",
  publishedDone: "Événement publié : il est visible sur la liste des événements.",
  /** Garde avant de quitter l'assistant avec une saisie non enregistrée. */
  leaveTitle: "Quitter l'assistant ?",
  leaveBodyKept: "Ta saisie reste gardée sur cet appareil : tu la retrouves en revenant dans l'assistant.",
  leaveBody: "Les modifications non enregistrées sont perdues.",
  leaveConfirm: "Quitter",
  leaveKeep: "Continuer",
  resumeLocal: (when: string) => `Saisie non enregistrée retrouvée (${when}).`,
  resumeLocalDiscard: "Repartir de l'événement enregistré",
  /** Copie d'un événement (duplication) : les dates sont à choisir, l'ouverture des candidatures suit. */
  copyNotice: "Copie en brouillon : choisis les nouvelles dates. L'ouverture des candidatures se décale avec le début.",
  /** Bandeau de l'aperçu d'un brouillon sur la page publique. */
  previewBanner: "Aperçu du brouillon : seule l'équipe organisatrice voit cette page tant qu'il n'est pas publié.",
} as const;

/** Adresse de l'événement, obligatoire (lot 36). */
export const eventAddressRequired = "Indique l'adresse et la ville de l'événement.";

/** Photos : ajout recadré, retrait confirmé, photo de couverture, envoi. */
export const photoLabels = {
  remove: "Retirer cette photo",
  removeTitle: "Retirer cette photo ?",
  removeBody: "Elle disparaît de ta fiche. Tu pourras en ajouter une autre.",
  removeConfirm: "Retirer",
  cover: "Couverture",
  makeCover: "En couverture",
  coverHint: "La photo de couverture illustre la fiche de ton véhicule. Touche « En couverture » sous une autre photo.",
  addOne: "Ajouter une photo",
  cropHint: "Chaque photo se recadre avant l'envoi.",
  uploading: (n: number, total: number) => `Envoi de la photo ${n} sur ${total}…`,
  uploadingOne: "Envoi de la photo…",
} as const;

/** Inscription express : conditions générales et fin du parcours. */
export const expressLabels = {
  terms: "J'accepte les conditions générales d'utilisation d'Orasso",
  termsLink: "Lire les conditions",
  termsRequired: "Accepte les conditions générales pour créer ton compte.",
  doneTitle: "Tu es inscrit",
  doneBody: (event: string) => `Ton entrée à « ${event} » est validée : tu es déjà pointé, profite de l'événement.`,
  appTitle: "Télécharge l'appli Orasso",
  appBody:
    "Tes accès, tes véhicules et les prochains événements autour de toi sont dans l'appli. Connecte-toi avec l'adresse et le mot de passe que tu viens de choisir.",
  appButton: "Télécharger l'appli",
  photoFailed: "La photo n'a pas pu être envoyée : ajoute-la depuis ton garage.",
} as const;

/** Page « l'appli » du site et e-mail « Installe l'appli ». */
export const appInstallLabels = {
  pageTitle: "L'appli Orasso",
  pageLead:
    "Accès, QR d'entrée, garage, événements autour de toi, notifications : tout Orasso dans ta poche, même sans réseau le jour J.",
  android: "Télécharger sur Google Play",
  soon: "L'appli arrive bientôt sur Google Play et l'App Store. En attendant, tout est disponible sur le site.",
  openSite: "Continuer sur le site",
  mailSubject: "Installe l'appli Orasso",
  mailIntro: (pseudo: string) => `Bonjour ${pseudo},`,
  mailBody:
    "Ton adresse est confirmée. Pour retrouver tes accès, ton QR d'entrée hors ligne et les événements autour de toi, installe l'appli Orasso et connecte-toi avec ton adresse et ton mot de passe.",
  mailButton: "Installer l'appli",
} as const;

/** Adresse d'une fiche pro : vérifiée par le géocodeur, comme celle d'une structure et d'un événement. */
export const proAddressLabels = {
  check: "Vérifier l'adresse",
  searching: "Recherche…",
  tooShort: "Saisis d'abord une adresse.",
  found: (label: string) => `Trouvée : ${label}`,
  notFound: "Adresse introuvable : ta fiche ne s'affichera pas sur la carte.",
  notLocated: "Adresse non trouvée sur la carte : vérifie-la.",
} as const;

/** Badge « pro vérifié » : jamais sans SIRET contrôlé dans le registre public. */
export const proVerifyTexts = {
  noSiret: "Pas de SIRET sur cette fiche : le pro doit d'abord saisir et faire contrôler son SIRET.",
  registryDown: "Registre public injoignable : réessaie dans quelques minutes.",
  notMatched: "SIRET introuvable ou établissement fermé dans le registre public : badge refusé.",
} as const;
