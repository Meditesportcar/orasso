import type { ContestState, ReportReason, ReportStatus, ReportTarget, SanctionKind } from "../moderation";

// Modération (lot 32) : signalements, sanctions, contestation. Libellés d'interface et textes des notifications.

/** Motifs (docs/01 : « insulte, arnaque, contenu choquant, faux profil, harcèlement… »). */
export const reportReasonLabels: Record<ReportReason, string> = {
  insult: "Insulte",
  scam: "Arnaque",
  shocking: "Contenu choquant",
  fake_profile: "Faux profil",
  harassment: "Harcèlement",
  spam: "Spam",
  dangerous_driving: "Conduite dangereuse",
  other: "Autre",
  misleading_info: "Informations fausses ou trompeuses",
  cancelled_unannounced: "Annulé sans prévenir",
  unauthorized_place: "Lieu non autorisé",
  abusive_pricing: "Prix abusifs",
  plate_or_face: "Plaque ou visage non flouté",
  copyright: "Droits d'auteur",
  fake_pro: "Faux pro",
  discount_not_applied: "Remise non appliquée",
  fake_reviews: "Avis trompeurs",
};

/** Un motif de la feuille « Signaler » : son libellé pour ce type, une phrase d'aide, `warn` pour un danger. */
export type ReportReasonText = { label: string; help?: string; warn?: boolean };

/**
 * Libellés et aides propres à un type (lot M6, maquette 9.2 et retour 21) : ce qui n'est pas ici reprend
 * `reportReasonLabels`. Une phrase d'aide sous les motifs sensibles ; « Autre » rappelle que la description est
 * obligatoire.
 */
const reasonOverrides: Partial<Record<ReportTarget, Partial<Record<ReportReason, ReportReasonText>>>> = {
  event: {
    scam: { label: "Faux événement ou arnaque", help: "N'existe pas, faux organisateur, demande d'argent" },
    misleading_info: { label: "Informations fausses ou trompeuses", help: "Date, lieu, prix ou nombre de places" },
    cancelled_unannounced: { label: "Annulé ou reporté sans être signalé" },
    dangerous_driving: {
      label: "Rodéo, course ou conduite dangereuse sur la voie publique",
      help: "Danger immédiat ? Appelle le 17.",
      warn: true,
    },
    unauthorized_place: { label: "Lieu non autorisé", help: "Parking privé sans accord, site interdit" },
    abusive_pricing: { label: "Billetterie ou prix abusifs" },
    shocking: { label: "Affiche ou contenu choquant" },
    spam: { label: "Doublon ou spam" },
  },
  profile: {
    harassment: { label: "Harcèlement", help: "Menace ou danger ? Appelle le 17.", warn: true },
    fake_profile: { label: "Faux profil", help: "Se fait passer pour quelqu'un d'autre" },
    scam: { label: "Arnaque", help: "Demande d'argent, vente douteuse" },
    dangerous_driving: {
      label: "Conduite dangereuse",
      help: "Danger immédiat ? Appelle le 17.",
      warn: true,
    },
  },
  vehicle: {
    plate_or_face: { label: "Plaque ou visage non flouté", help: "Une plaque ou une personne reconnaissable" },
    shocking: { label: "Photo ou contenu choquant" },
    copyright: { label: "Photos volées ou droits d'auteur", help: "Ce n'est pas sa voiture ou pas ses photos" },
    misleading_info: { label: "Fiche fausse ou trompeuse", help: "Modèle, année ou chiffres inventés" },
  },
  photo: {
    plate_or_face: { label: "Plaque ou visage non flouté", help: "Une plaque ou une personne reconnaissable" },
    shocking: { label: "Photo choquante" },
    copyright: { label: "Droits d'auteur", help: "La photo appartient à quelqu'un d'autre" },
  },
  message: {
    harassment: { label: "Harcèlement", help: "Menace ou danger ? Appelle le 17.", warn: true },
    scam: { label: "Arnaque", help: "Demande d'argent, lien douteux" },
  },
  review: {
    misleading_info: { label: "Avis faux ou de mauvaise foi", help: "N'est pas venu, ou parle d'autre chose" },
  },
  crew: {
    shocking: { label: "Nom, photo ou contenu choquant" },
    fake_profile: { label: "Faux crew ou usurpation" },
    dangerous_driving: {
      label: "Rodéos ou conduite dangereuse",
      help: "Danger immédiat ? Appelle le 17.",
      warn: true,
    },
  },
  pro: {
    fake_pro: { label: "Faux pro", help: "L'atelier n'existe pas, ou ce n'est pas le sien" },
    scam: { label: "Arnaque", help: "Acompte jamais rendu, travail non fait" },
    discount_not_applied: { label: "Remise non appliquée", help: "La remise Orasso a été refusée sur place" },
    fake_reviews: { label: "Avis trompeurs" },
  },
  provider: {
    fake_pro: { label: "Faux prestataire", help: "N'existe pas, ou ce n'est pas le sien" },
    scam: { label: "Arnaque", help: "Acompte jamais rendu, prestation non faite" },
    fake_reviews: { label: "Avis trompeurs" },
  },
  announcement: {
    misleading_info: { label: "Information fausse ou trompeuse" },
    shocking: { label: "Contenu choquant" },
  },
};

const otherText: ReportReasonText = { label: "Autre", help: "Décris ce qui s'est passé (obligatoire)" };

/** Le texte d'un motif dans la feuille « Signaler » de ce type. */
export function reportReasonText(target: ReportTarget, reason: ReportReason): ReportReasonText {
  if (reason === "other") return otherText;
  return reasonOverrides[target]?.[reason] ?? { label: reportReasonLabels[reason] };
}

/** Sous le titre de la feuille : qui lit, et l'anonymat (l'organisateur, le pro ou la personne ne sait pas qui). */
export const reportSheetNotice: Record<ReportTarget, string> = {
  event: "L'équipe Orasso lit chaque signalement. L'organisateur ne sait pas qui l'a fait.",
  profile: "L'équipe Orasso lit chaque signalement. La personne signalée ne saura jamais qui l'a signalée.",
  vehicle: "L'équipe Orasso lit chaque signalement. Le propriétaire ne sait pas qui l'a fait.",
  photo: "L'équipe Orasso lit chaque signalement. L'auteur de la photo ne sait pas qui l'a fait.",
  message: "L'équipe Orasso lit chaque signalement. La personne signalée ne saura jamais qui l'a signalée.",
  review: "L'équipe Orasso lit chaque signalement. L'auteur de l'avis ne sait pas qui l'a fait.",
  crew: "L'équipe Orasso lit chaque signalement. Le crew ne sait pas qui l'a fait.",
  pro: "L'équipe Orasso lit chaque signalement. Le pro ne sait pas qui l'a fait.",
  provider: "L'équipe Orasso lit chaque signalement. Le prestataire ne sait pas qui l'a fait.",
  announcement: "L'équipe Orasso lit chaque signalement. L'organisateur ne sait pas qui l'a fait.",
};

export const reportTargetLabels: Record<ReportTarget, string> = {
  profile: "Profil",
  vehicle: "Véhicule",
  photo: "Photo",
  message: "Message",
  event: "Événement",
  review: "Avis",
  crew: "Crew",
  pro: "Fiche pro",
  provider: "Prestataire",
  announcement: "Annonce",
};

/** Ce qu'on signale, dans le titre de la feuille (« Signaler ce profil »). */
export const reportTargetThis: Record<ReportTarget, string> = {
  profile: "ce profil",
  vehicle: "ce véhicule",
  photo: "cette photo",
  message: "ce message",
  event: "cet événement",
  review: "cet avis",
  crew: "ce crew",
  pro: "cette fiche pro",
  provider: "ce prestataire",
  announcement: "cette annonce",
};

export const reportStatusLabels: Record<ReportStatus, string> = {
  pending: "À traiter",
  reviewing: "En cours d'examen",
  resolved_action: "Traité : mesure prise",
  resolved_no_action: "Traité : sans suite",
  dismissed_abusive: "Rejeté : signalement abusif",
};

/** Échelle des sanctions (docs/01). */
export const sanctionKindLabels: Record<SanctionKind, string> = {
  warning: "Avertissement",
  suspension_7d: "Suspension de 7 jours",
  suspension_30d: "Suspension de 30 jours",
  ban: "Bannissement définitif",
};

export const contestStateLabels: Record<ContestState, string> = {
  none: "Pas de contestation",
  pending: "Contestation en cours d'examen",
  upheld: "Contestation examinée : sanction maintenue",
  lifted: "Contestation examinée : sanction levée",
};

export const moderationLabels = {
  report: "Signaler",
  reportTitle: (what: string) => `Signaler ${what}`,
  reason: "Motif",
  details: "Détails",
  detailsHint: "Ce qui s'est passé, en quelques mots (obligatoire pour « Autre »).",
  // Lot M6 (maquette 9.2) : la feuille de l'appli et la fenêtre du site.
  whatHappened: "Ce qui s'est passé",
  whatHappenedOptional: "Ce qui s'est passé (facultatif)",
  whatHappenedRequired: "Ce qui s'est passé (obligatoire)",
  whatHappenedPlaceholder: "En quelques mots",
  chooseReason: "Choisis un motif.",
  otherNeedsDetails: "Précise le motif « Autre » en quelques mots.",
  screenshot: "Capture d'écran",
  addScreenshot: "Ajouter une capture",
  changeScreenshot: "Changer la capture",
  removeScreenshot: "Retirer la capture",
  screenshotHint: "Facultatif. Seule l'équipe Orasso la verra.",
  messageContextNotice:
    "Le message signalé et les 5 messages avant et après sont joints au signalement. Seule l'équipe Orasso les lira.",
  anonymityNotice: "La personne signalée ne saura jamais qui l'a signalée.",
  send: "Envoyer le signalement",
  cancel: "Annuler",
  sent: "Merci. Ton signalement a été envoyé à l'équipe Orasso : tu seras prévenu quand il aura été traité.",
  alreadyReported: "Tu as déjà signalé ce contenu.",
  // Compte suspendu (§ 0.4 et § 15.2).
  suspendedTitle: "Compte suspendu",
  bannedTitle: "Compte banni",
  suspendedUntil: (date: string) => `Compte suspendu jusqu'au ${date}`,
  suspendedReason: (reason: string) => `Motif : ${reason}`,
  suspendedReadOnly:
    "Pendant la suspension, tu peux tout consulter et lire tes messages, mais tu ne peux ni écrire, ni candidater, ni publier.",
  contest: "Contester",
  contestTitle: "Contester la sanction",
  contestHint: "Une seule contestation par sanction. Le super administrateur revoit le dossier et te répond.",
  contestMessage: "Ton explication",
  contestSend: "Envoyer la contestation",
  contestSent: "Contestation envoyée. Tu recevras la décision par notification et par e-mail.",
  mySanctions: "Mes sanctions",
  mySanctionsEmpty: "Aucune sanction sur ton compte.",
  sanctionFrom: (date: string) => `Depuis le ${date}`,
  sanctionUntil: (date: string) => `jusqu'au ${date}`,
  sanctionLifted: (date: string) => `Levée le ${date}`,
  // Administration.
  queueTitle: "Signalements",
  sanctionsTitle: "Sanctions",
  queueEmpty: "Aucun signalement dans cette file.",
  sanctionsEmpty: "Aucune sanction dans cette liste.",
  autoSanction: "Suspension automatique",
  reporterLabel: "Signalé par",
  contextTitle: "Conversation jointe au signalement",
  targetGone: "Le contenu n'existe plus.",
  targetRemoved: "Contenu déjà retiré par la modération.",
  markReviewing: "Prendre en charge",
  closeNoAction: "Clore sans suite",
  resolveAction: "Clore : mesure prise",
  dismissAbusive: "Rejeter : signalement abusif",
  sanctionSubmit: "Appliquer",
  hideContent: "Retirer le contenu",
  sanctionReporter: "Sanctionner le signaleur",
  noSanction: "Aucune sanction (retrait du contenu seulement)",
  uphold: "Maintenir la sanction",
  lift: "Lever la sanction",
  decisionNote: "Note (envoyée à la personne)",
  messageRemoved: "Message retiré par la modération",
} as const;

/** Textes des notifications de la modération (famille « Sécurité du compte », e-mail toujours). */
export const moderationNotificationTexts = {
  sanctionReceived: (kind: SanctionKind, reason: string, until: string | null) => ({
    title: sanctionKindLabels[kind],
    body:
      kind === "warning"
        ? `Tu as reçu un avertissement de l'équipe Orasso. Motif : ${reason}. Tu peux le contester une fois.`
        : kind === "ban"
          ? `Ton compte a été banni d'Orasso. Motif : ${reason}. Tu peux contester une fois en répondant à cet e-mail.`
          : `Ton compte est suspendu jusqu'au ${until ?? ""}. Motif : ${reason}. Tu peux tout consulter mais plus écrire ; tu peux contester une fois.`,
  }),
  reportHandled: {
    title: "Signalement traité",
    body: "Ton signalement a été traité par l'équipe Orasso. Merci de nous aider à garder Orasso sûr.",
  },
  contestDecided: (lifted: boolean, note: string | null) => ({
    title: lifted ? "Sanction levée" : "Sanction maintenue",
    body: `${lifted ? "Après examen de ta contestation, la sanction est levée." : "Après examen de ta contestation, la sanction est maintenue."}${note ? ` ${note}` : ""}`,
  }),
  sanctionLifted: (note: string | null) => ({
    title: "Sanction levée",
    body: `L'équipe Orasso a levé la sanction de ton compte.${note ? ` ${note}` : ""}`,
  }),
  priorityAlert: (pseudo: string, count: number) => ({
    title: "Alerte prioritaire : suspension automatique",
    body: `${pseudo} a été suspendu 7 jours automatiquement après ${count} signalements en 24 heures. À examiner rapidement.`,
  }),
  linkSanctions: "Voir mes sanctions",
  linkQueue: "Ouvrir la file des signalements",
} as const;
