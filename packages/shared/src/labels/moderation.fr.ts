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
