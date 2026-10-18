import type { InvitationStatus } from "../enums";
import { type Grade, gradeLabels, grades } from "../grades";
import { gradeRank } from "../rules/invitations";
import type { InvitationSkipReason } from "../schemas/invitations";

// Invitations nominatives, événement privé, avantages des hauts grades (lot 25) : libellés du site et de l'appli.

export const invitationStatusLabels: Record<InvitationStatus, string> = {
  pending: "En attente",
  accepted: "Acceptée",
  declined: "Refusée",
  expired: "Expirée",
  withdrawn: "Retirée",
};

export const invitationSkipLabels: Record<InvitationSkipReason, string> = {
  unknown: "introuvable",
  already_invited: "déjà invité",
  recent: "déjà invité dans les dernières 24 h",
  banned: "banni de la structure",
  self: "toi-même",
  quota: "limite du jour atteinte",
};

/** « Circuit et Légende » : les grades concernés à partir du seuil. */
export function highGradesText(min: Grade): string {
  const names = grades.filter((g) => gradeRank(g) >= gradeRank(min)).map((g) => gradeLabels[g]);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} et ${names.at(-1)}`;
}

/** « Avant-première abonnés 24 h · grades Circuit et Légende 48 h » (page de l'événement, § 9.2). */
export function previewSummary(e: {
  previewHours: number;
  highGradePreviewHours: number;
  highGradeMin: Grade;
}): string | null {
  const parts: string[] = [];
  if (e.previewHours > 0) parts.push(`abonnés ${e.previewHours} h`);
  if (e.highGradePreviewHours > 0) parts.push(`grades ${highGradesText(e.highGradeMin)} ${e.highGradePreviewHours} h`);
  if (!parts.length) return null;
  return `Avant-première ${parts.join(" · ")}`;
}

export const invitationLabels = {
  // Événement privé.
  privateEvent: "Événement privé sur invitation",
  privateEventHint: "Seuls les invités voient cet événement. Si tu as reçu une invitation, ouvre-la depuis Accès.",
  privateBadge: "Sur invitation",
  invitationRequired:
    "Cet événement est sur invitation : seule une invitation de l'équipe organisatrice permet d'y participer.",
  // Invitations reçues (Accès, Boîte > Demandes).
  received: "Invitations reçues",
  receivedEmpty: "Aucune invitation en attente.",
  invitedBy: (structure: string) => `Invitation de ${structure}`,
  invitedVehicle: (label: string) => `Pour ton véhicule : ${label}`,
  validUntil: (date: string) => `Valable jusqu'au ${date}`,
  answer: "Répondre",
  accept: "Accepter",
  decline: "Refuser",
  declineConfirm: "Refuser l'invitation ? L'organisateur le verra.",
  chooseVehicle: "Avec quel véhicule ?",
  noEligibleVehicle: "Aucun véhicule de ton garage n'est admis ici : ajoute-en un (avec au moins une photo).",
  addVehicle: "Ajouter un véhicule",
  rulesNotice: "En acceptant, tu acceptes le règlement de l'événement.",
  readRules: "Lire le règlement",
  accepted: "Invitation acceptée : tu es retenu, ton QR est dans Accès.",
  waitlisted: "Invitation acceptée, mais l'événement est complet : tu es en tête de la liste d'attente.",
  declined: "Invitation refusée.",
  openEvent: "Voir l'événement",
  openAccess: "Ouvrir mes accès",
  // Page du lien `/invitation-evenement/:jeton`.
  linkTitle: "Tu es invité",
  linkSignIn: "Se connecter pour répondre",
  linkSignUp: "Créer un compte",
  linkNotMine: "Cette invitation a été envoyée à une autre adresse e-mail. Connecte-toi avec le compte invité.",
  linkGone: "Cette invitation n'est plus valable.",
  linkUnknown: "Lien d'invitation introuvable.",
  // Organisateur.
  invite: "Inviter",
  invitations: "Invitations",
  inviteTitle: "Inviter à l'événement",
  invitePseudo: "Par pseudo",
  invitePseudoHint: "Un ou plusieurs pseudos, séparés par des virgules.",
  inviteVehicles: "Par véhicule",
  inviteVehiclesHint: "Véhicules de tes abonnés et retenus de tes éditions précédentes.",
  inviteEmail: "Par e-mail",
  inviteEmailHint: "Pour quelqu'un qui n'a pas encore de compte : il reçoit un lien.",
  message: "Message (facultatif)",
  messagePlaceholder: "Un mot pour les invités",
  send: "Envoyer les invitations",
  fromEvent: (title: string) => `Inviter les retenus de l'édition « ${title} »`,
  fromEventHint: "Tous les véhicules retenus de cette édition, sans doublon.",
  noSourceEvent: "Aucune édition passée avec des retenus.",
  sentList: "Invitations envoyées",
  sentEmpty: "Aucune invitation pour l'instant.",
  remove: "Retirer",
  mailSkipped: "E-mail non envoyé (limite du jour)",
  mailPending: "E-mail en cours d'envoi",
  created: (n: number) => (n === 1 ? "1 invitation envoyée" : `${n} invitations envoyées`),
  skipped: (n: number) => (n === 1 ? "1 cible ignorée" : `${n} cibles ignorées`),
  targetEmail: "Adresse e-mail",
  targetVehicle: "Véhicule",
  targetUser: "Personne",
  noCandidates: "Aucun véhicule d'abonné ni de retenu passé pour l'instant.",
  // Assistant d'événement : hauts grades.
  highGradeTitle: "Hauts grades",
  highGradePriority: "Priorité en liste d'attente pour les hauts grades",
  highGradePriorityHint: "Un haut grade passe devant les grades inférieurs, derrière les hauts grades arrivés avant.",
  highGradePreview: "Avant-première des hauts grades (heures)",
  highGradePreviewHint: "Ne s'ajoute pas à celle des abonnés : la plus longue l'emporte.",
  highGradeMin: "À partir du grade",
  // Notifications et e-mail.
  notifTitle: "Invitation à un événement",
  notifBody: (structure: string, title: string) => `${structure} t'invite à « ${title} ».`,
  capacityTitle: "Invité en liste d'attente",
  capacityBody: (pseudo: string, title: string) =>
    `${pseudo} a accepté ton invitation à « ${title} », mais l'événement est complet : il est en tête de la liste d'attente.`,
  mailSubject: (title: string) => `Invitation · ${title}`,
  mailIntro: (structure: string, title: string, date: string) =>
    `${structure} t'invite à « ${title} » (${date}) sur Orasso.`,
  mailHow: "Crée ton compte (ou connecte-toi) avec cette adresse e-mail, puis accepte l'invitation avec ton véhicule.",
  mailCta: "Voir l'invitation",
} as const;
