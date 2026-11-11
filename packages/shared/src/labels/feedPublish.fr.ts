import { BUSINESS_TIMEZONE } from "../enums";
import type { FeedAttachPhase, FeedEventRole } from "../rules/feedAttach";
import { wallTime } from "../rules/time";

// Écran « Publier » (vague R8, lot R8p, maquette R8.4 `p-rattache`) : au nom de qui, pour quel événement, « Info importante »,
// « Ce que verront les autres ». Les mots sont ceux de `publierH` (`page-r8.js`), au caractère près ; ceux que la maquette ne
// montre pas (prestataire, média, refus) sont écrits ici et consignés dans le journal des choix (« Lot R8p »). Le site et
// l'appli lisent ce même fichier.

/** Où la publication va vivre : la maison de son auteur. */
export type PublishDestination = "me" | "structure" | "pro" | "provider" | "media";

export const feedPublishLabels = {
  /** La phrase de tête : `lead` en gras, puis `rest`. */
  oneGesture: {
    lead: "Un seul geste, une seule chose :",
    rest: "la publication va sur ton profil, et le Fil la montre aux autres.",
  },
  asTitle: "Publier en tant que",
  attachLeadMe: "Rattacher à une sortie",
  attachLead: "Rattacher à un événement",
  optional: "facultatif",
  attachNone: "Aucun",
  /** Sous « Aucun », selon la casquette. */
  attachNoneHint: {
    me: "Aucun événement : ta publication reste sur ton profil et dans le Fil.",
    structure: "Sans événement : une publication de la structure (boutique, collaboration…).",
    pro: "Sans événement : une publication de ta fiche pro (nouveauté, réalisation…).",
    provider: "Sans événement : une publication de ta page de prestataire (nouveauté, réalisation…).",
    media: "Sans événement : une publication de ta page de média (reportage, album…).",
  } satisfies Record<PublishDestination, string>,
  attachFoot: "Le tampon « Présent » ne s'ajoute que si ta présence a été validée (QR ou GPS).",
  attachLoading: "Chargement de tes événements…",
  attachFailed: "Tes événements n'ont pas pu être chargés : tu peux publier sans.",
  placeLabel: "Lieu",
  placeHint: "Facultatif · 80 caractères au plus",
  placePlaceholder: "Port de Collioure",
  captionHintPage: "Facultatif · 2 000 caractères au plus",
  /** Le visuel (T1) : sans photo, l'affiche de l'événement. */
  posterAlt: (title: string) => `Affiche de l'événement ${title}`,
  posterNote: "Sans photo : l'affiche de l'événement sera le visuel.",
  previewTitle: "Visuel",
  // Ce qui bloque « Publier » (une ligne qui dit quoi).
  noPoster: "Cet événement n'a pas d'affiche : ajoute une photo.",
  posterNeedsCaption: "Sans photo, écris un mot : l'affiche de l'événement sera le visuel.",
  captionTooLongPage: "Un mot de 2 000 caractères au plus.",
  tooManyPhotos: "Six photos au plus.",

  // « Info importante ».
  important: "Info importante",
  importantOff: "Sans la case : la publication alimente le journal et le résumé du jour, sans notifier.",
  importantReason: "Motif · obligatoire",
  importantLimit: {
    day: "Plus d'info importante aujourd'hui pour cet événement.",
    week: "Plus d'info importante cette semaine pour cet événement.",
  },
  importantQuota: (leftToday: number, leftWeek: number) => ({
    lead: `Encore ${leftToday} aujourd'hui, ${leftWeek} cette semaine`,
    rest: "pour cet événement : une par jour, trois par semaine, pour que personne ne coupe tout.",
  }),
  importantChecked: "cochée",
  importantUnchecked: "décochée",

  // « Ce que verront les autres ».
  says: "Ce que verront les autres",
  sayNow: "À l'instant",
  stamp: "Présent",
  ending: {
    /** Événement de la structure : son journal et son profil. */
    organizerEvent:
      "Elle devient une publication de la fiche de l'événement (son journal) et du profil de la structure.",
    importantAdd: " Les inscrits sont prévenus (info importante).",
  },

  // Envoi et refus.
  sending: "Publication…",
  noNetwork: "Pas de réseau : ta publication est gardée. Réessayer renvoie exactement la même, sans doublon.",
  uncertainTitle: "Envoi en cours de vérification",
  uncertainRetry: "Réessayer",
  uncertainEdit: "Modifier ma publication",
  uncertainChecking: "Vérification de l'envoi…",
  uncertainUnchecked: "Impossible de vérifier l'envoi pour l'instant : réessaie dans un instant.",
  accountChanged: "Ta session a changé dans un autre onglet : recharge la page avant de publier.",
  sessionLost: "Ta session a expiré : reconnecte-toi, ta publication en cours est gardée.",
  uncertainFound: "Ta publication est en ligne.",
  attachRetry: "Réessayer",
  securityLink: "Ouvrir la sécurité du compte",
  forbiddenMore: "Pour publier au nom d'une structure, la double authentification doit être active.",
  listReloaded: "Ta liste d'événements a été mise à jour : choisis-en un, ou publie sans.",
  quotaReached: "Info importante déjà envoyée : le plafond de cet événement est atteint.",
} as const;

/** Le titre d'une ligne « Publier en tant que ». */
export function publishAuthorTitle(destination: PublishDestination, name: string): string {
  switch (destination) {
    case "me":
      return `Moi · ${name}`;
    case "structure":
      return `${name} · ma structure`;
    case "pro":
      return `${name} · ma fiche pro`;
    case "provider":
      return `${name} · mon profil de prestataire`;
    case "media":
      return `${name} · mon profil de média`;
  }
}

/** La ligne sous le titre. */
export const publishAuthorHint: Record<PublishDestination, string> = {
  me: "Ta publication personnelle",
  structure: "Visible sur la page de la structure",
  pro: "Visible sur ta fiche pro",
  provider: "Visible sur ta page de prestataire",
  media: "Visible sur ta page de média",
};

/** Où elle reste, dans la phrase « Elle reste sur … ». */
export const publishAuthorWhere: Record<PublishDestination, string> = {
  me: "ton profil",
  structure: "la page de la structure",
  pro: "ta fiche pro",
  provider: "ta page de prestataire",
  media: "ta page de média",
};

/** Le verbe du rattachement, devant le titre de l'événement (mots de `feedAttachLabels` ; « est au » : un passionné pendant l'événement). */
export function attachVerb(role: FeedEventRole | null, phase: FeedAttachPhase): string {
  if (role === "organizer") return "pour le";
  if (role === "on_site") return "présent au";
  if (role === "attendee") return phase === "after" ? "était au" : phase === "running" ? "est au" : "sera au";
  return "";
}

/** « sera au Nocturne de Canet » : le verbe puis le titre, jamais tronqué. */
export const attachPhraseOf = (role: FeedEventRole | null, phase: FeedAttachPhase, title: string): string =>
  role ? `${attachVerb(role, phase)} ${title}` : title;

const DAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."] as const;
const MONTHS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
] as const;

/** « sam. 14 nov. » (jour de Paris). */
export function attachDateLabel(iso: string, timeZone = BUSINESS_TIMEZONE): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const w = wallTime(d, timeZone);
  const weekday = new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();
  return `${DAYS[weekday]} ${w.day} ${MONTHS[w.month - 1]}`;
}

/** L'état d'un événement rattachable (sous son titre) : copie de la maquette (`PERS`). */
export function attachStateLabel(role: FeedEventRole, phase: FeedAttachPhase): string {
  if (role === "on_site") return "tu y es retenu";
  if (role === "attendee" && phase === "after") return "tu y étais";
  if (phase === "after") return "30 derniers jours";
  if (phase === "running") return "en cours";
  return "à venir";
}

/** La case « Info importante » cochée : qui est prévenu, et quand (`immediate` : tout de suite, sinon à 8 h). */
export function importantWhoText(recipients: number | null, immediate: boolean): string {
  const when = immediate ? "tout de suite" : "à 8 h";
  if (recipients === null) return `Les inscrits sont prévenus ${when} (notification « Essentiel »).`;
  if (recipients === 0) return "Aucun inscrit à prévenir pour l'instant.";
  if (recipients === 1) return `1 inscrit est prévenu ${when} (notification « Essentiel »).`;
  return `Les ${recipients} inscrits sont prévenus ${when} (notification « Essentiel »).`;
}

/** La phrase sous « Ce que verront les autres » : cinq variantes (maquette `where`, `page-r8.js` ligne 219). */
export function publishWhereText(input: {
  destination: PublishDestination;
  /** Rôle déduit de l'événement choisi ; `null` : aucun événement. */
  role: FeedEventRole | null;
  phase: FeedAttachPhase;
  important: boolean;
}): string {
  const { destination, role, phase, important } = input;
  if (!role) return `Elle reste sur ${publishAuthorWhere[destination]} et le Fil la montre à tes abonnés.`;
  if (destination === "structure") {
    return feedPublishLabels.ending.organizerEvent + (important ? feedPublishLabels.ending.importantAdd : "");
  }
  if (destination === "me") {
    const rubric = phase === "after" ? "Passionnés, j'y étais" : "Passionnés, j'y serai";
    return `Elle reste sur ton profil. Sur la fiche de l'événement, elle apparaît dans « Mentions » (rubrique « ${rubric} ») si ton compte est public. ${feedPublishLabels.attachFoot}`;
  }
  return `Elle reste sur ${publishAuthorWhere[destination]}. Sur la fiche de l'événement, elle apparaît dans « Mentions » (rubrique « Sur place »), pas dans ses publications.`;
}
