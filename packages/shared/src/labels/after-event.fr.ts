import type { StructureSuspensionReason } from "../enums";

// Après l'événement et badge de structure (lot 27) : libellés du site et de l'appli.

export const suspensionReasonLabels: Record<StructureSuspensionReason, string> = {
  badge_expired: "Badge non renouvelé",
  moderation: "Décision de l'équipe Orasso",
};

export const afterEventLabels = {
  // Page « Après l'événement » (site, /orga/:s/e/:id/apres) et appli.
  title: "Après l'événement",
  navLink: "Bilan et remerciement",
  notEnded: "L'événement n'est pas fini : le bilan se calcule à J+2, une fois les points attribués.",
  notReady: "Le bilan se calcule à J+2, une fois les points attribués.",
  reportTitle: "Bilan",
  reportFinal: (date: string) => `Bilan définitif depuis le ${date} (avis compris).`,
  reportProvisional: (date: string) => `Bilan provisoire : il sera mis à jour le ${date}, à la fin des avis.`,
  registered: "Candidatures",
  accepted: "Retenus",
  present: "Présents",
  absent: "Absents",
  presenceRate: "Taux de présence",
  byCategory: "Catégories venues",
  byMake: "Marques venues",
  byDepartment: "Départements d'origine",
  providers: "Prestataires",
  providersValue: (present: number, accepted: number) => `${present} venus sur ${accepted} retenus`,
  staff: "Staff",
  staffValue: (present: number, expected: number) => `${present} présents sur ${expected} attendus`,
  newFollowers: "Nouveaux abonnés",
  incidents: "Incidents",
  reviews: "Avis",
  reviewsValue: (count: number, average: string | null) =>
    average ? `${count} avis · moyenne ${average} / 3` : `${count} avis · moyenne dès 3 avis`,
  scans: "Lectures de QR",
  scansValue: (total: number, duplicates: number, overrides: number) =>
    `${total} lectures · ${duplicates} doublons · ${overrides} acceptés quand même`,
  points: "Points attribués",
  pointsValue: (participations: number, malus: number) => `${participations} participations · ${malus} malus`,
  none: "Aucune donnée.",
  count: (n: number) => (n > 1 ? `${n} véhicules` : `${n} véhicule`),

  // Remerciement.
  thanksTitle: "Remerciement aux présents",
  thanksIntro:
    "Un message dans la Boîte de chaque présent, avec son lien pour laisser un avis. Il part une seule fois, jusqu'à J+7.",
  thanksTemplate: "Modèle de remerciement",
  thanksBody: "Texte du message",
  thanksPreview: "Aperçu pour toi",
  thanksRecipients: (n: number) => (n > 1 ? `${n} présents le recevront` : `${n} présent le recevra`),
  thanksSend: "Envoyer aux présents",
  thanksSending: "Envoi…",
  thanksSent: (date: string) => `Remerciement envoyé le ${date}.`,
  thanksDone: "Remerciement envoyé aux présents.",
  thanksConfirm: (n: number) => `Envoyer ce message à ${n} ${n > 1 ? "présents" : "présent"} ? Il ne part qu'une fois.`,
  thanksBlocked: {
    sent: "Le remerciement est déjà parti.",
    not_published: "Seul un événement publié peut être remercié.",
    not_ended: "Le remerciement part après la fin de l'événement.",
    too_late: "Le remerciement n'est plus possible après J+7.",
  },
  thanksNoPresent: "Personne n'a été pointé : il n'y a personne à remercier.",
  thanksEmail: "Les présents reçoivent un message dans leur Boîte, une notification et une ligne du Journal.",

  // Export.
  exportTitle: "Export des participants",
  exportIntro:
    "Un fichier CSV avec les coordonnées des retenus, pour une demande des autorités ou une enquête. Chaque export est enregistré au journal d'Orasso, avec ton motif, et le fichier porte le nom de la structure.",
  exportReason: "Motif de l'export",
  exportReasonHint: "Au moins 10 caractères. Il est conservé avec la date, ton nom et ton adresse.",
  exportButton: "Exporter le CSV",
  exportTrace: "Cet export sera tracé : qui, quand, pourquoi.",
  exportNotes: "Les notes internes ne sont jamais incluses dans le fichier.",
  exportDone: "Export téléchargé et enregistré au journal.",

  // Édition suivante.
  nextTitle: "Édition suivante",
  nextIntro:
    "Duplique l'événement pour l'année prochaine, puis invite en un geste les véhicules retenus de cette édition.",
  nextDuplicate: "Dupliquer pour l'année prochaine",
  nextInvite: "Inviter les retenus",
  nextInviteHint: "Depuis la page du nouvel événement, onglet Invitations : choisis cette édition comme source.",
  nextDuplicated: "Copie créée en brouillon.",

  // Notes internes.
  notesTitle: "Notes internes",
  notesIntro: "Privées : seule ta structure les voit. Reste factuel : la personne peut demander à les lire.",
  notesHelp: "Reste factuel : la personne peut demander à lire ces notes.",
  notesEmpty: "Aucune note.",
  notesAdd: "Ajouter une note",
  notesSave: "Enregistrer la note",
  notesDelete: "Supprimer",
  notesEdit: "Modifier",
  notesBody: "Note",
  notesPseudo: "Pseudo de la personne",
  notesSearch: "Chercher par pseudo",
  notesPrivate: "Visible de ta structure seulement",
  notesCount: (n: number) => (n > 1 ? `${n} notes` : `${n} note`),
  notesNotFound: "Cette personne n'a jamais candidaté chez vous.",
  notesBy: (pseudo: string | null) => (pseudo ? `par ${pseudo}` : "auteur supprimé"),

  // Badge de structure.
  badgeExpiring: (days: number) =>
    days <= 0
      ? "Le badge de ta structure expire aujourd'hui."
      : `Le badge de ta structure expire dans ${days} ${days > 1 ? "jours" : "jour"}.`,
  badgeExpiringHint: "L'équipe Orasso te contactera pour le renouveler. Sans nouvelles, la structure sera suspendue.",
  badgeSuspended: "Structure suspendue : tu peux consulter tes données, mais plus publier ni écrire.",
  badgeSuspendedExpired:
    "Structure suspendue faute de renouvellement du badge. Écris à l'équipe Orasso pour la rétablir : rien n'est supprimé.",
  badgeSuspendedModeration: "Structure suspendue par l'équipe Orasso. Rien n'est supprimé.",
  badgeContact: "Écrire à l'équipe",

  // Administration.
  adminBadgesTitle: "Badges des structures",
  adminBadgesIntro:
    "Les badges valent un an. Un mois, une semaine et la veille avant l'échéance, la structure est prévenue ; sans renouvellement, elle est suspendue (rien n'est supprimé).",
  adminFilterExpiring: "À renouveler",
  adminFilterSuspended: "Suspendues",
  adminFilterAll: "Toutes",
  adminEmpty: "Aucune structure dans cette liste.",
  adminDaysLeft: (days: number | null) =>
    days === null ? "Sans échéance" : days <= 0 ? "Échéance atteinte" : `Dans ${days} ${days > 1 ? "jours" : "jour"}`,
  adminExpiresOn: (date: string) => `Échéance le ${date}`,
  adminReminded: "Rappels envoyés",
  adminRenew: "Renouveler un an",
  adminRenewNote: "Note du renouvellement (facultative)",
  adminSuspend: "Suspendre",
  adminLift: "Lever la suspension",
  adminReason: "Motif",
  adminReasonHint: "Conservé au journal d'administration.",
  adminOpen: "Ouvrir la fiche",
  adminDone: "Fait, et enregistré au journal.",
  adminLiftHint: "La suspension est levée ; si le badge est échu, il repart pour 30 jours de grâce.",

  // Transfert de propriétaire.
  transferTitle: "Changement de propriétaire",
  transferIntro:
    "Sur justificatif seulement (départ du président, conflit). L'ancien propriétaire devient co-organisateur ; les deux sont prévenus par e-mail.",
  transferOwner: "Propriétaire actuel",
  transferNew: "Pseudo du nouveau propriétaire",
  transferReason: "Motif (au moins 10 caractères)",
  transferDocument: "Justificatif",
  transferUpload: "Téléverser un justificatif",
  transferUploadHint: "PDF, JPEG, PNG ou WebP, 10 Mo au plus. Visible de l'équipe seulement.",
  transferNoDocument: "Téléverse d'abord le justificatif (procès-verbal, démission, décision de justice…).",
  transferButton: "Transférer la propriété",
  transferDone: "Propriété transférée.",
  members: "Équipe",
  documents: "Justificatifs",

  // Lien d'avis (feuille d'avis ouverte depuis un message).
  reviewFromLink: "Laisse ton avis sur l'événement",
  reviewLinkInvalid: "Ce lien d'avis n'est plus valable.",
  reviewLinkNotYours: "Ce lien d'avis ne t'appartient pas.",
  thanksJournalTitle: (event: string) => `Merci d'être venu à « ${event} »`,
  thanksJournalBody: "Ton avis aide l'organisateur à faire mieux la prochaine fois.",
  thanksJournalAction: "Donner mon avis",

  // Notifications.
  reportReadyTitle: (event: string) => `Bilan prêt · ${event}`,
  reportReadyBody: "Présents, absents, catégories, abonnés : ouvre le bilan.",
  thanksSuggestedTitle: (event: string) => `Remercie les présents · ${event}`,
  thanksSuggestedBody: (n: number) =>
    `${n} ${n > 1 ? "personnes sont venues" : "personne est venue"} : un message de remerciement est prêt.`,
  badgeReminderTitle: (name: string) => `Badge de ${name}`,
  badgeReminderBody: (day: number, date: string) =>
    day === 30
      ? `Le badge de ta structure expire dans un mois, le ${date}. L'équipe Orasso prendra contact pour le renouveler.`
      : day === 7
        ? `Le badge de ta structure expire dans une semaine, le ${date}. Sans renouvellement, la structure sera suspendue.`
        : `Le badge de ta structure expire demain, le ${date}. Sans renouvellement, la structure sera suspendue.`,
  badgeSuspendedTitle: (name: string) => `${name} est suspendue`,
  badgeSuspendedBody:
    "Le badge n'a pas été renouvelé : la structure est suspendue. Rien n'est supprimé ; écris à l'équipe Orasso pour la rétablir.",
  ownerChangedTitle: (name: string) => `Propriété de ${name} modifiée`,
  ownerChangedOld:
    "L'équipe Orasso a transféré la propriété de la structure, sur justificatif. Tu en restes co-organisateur.",
  ownerChangedNew: "L'équipe Orasso t'a confié la propriété de la structure, sur justificatif.",
} as const;
