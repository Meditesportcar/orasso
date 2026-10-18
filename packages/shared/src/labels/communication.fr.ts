import type { AnnouncementAudience, AnnouncementKind, MessageSegment, TemplateKind } from "../communication";
import type { EventOutlook } from "../enums";

// Communication de l'organisateur (lot 20) : libellés d'interface (site et appli). Les segments reprennent les mots
// des docs (« Retenue », « Liste d'attente »…).

export const messageSegmentLabels: Record<MessageSegment, string> = {
  accepted: "Retenus",
  waitlisted: "Liste d'attente",
  pending: "Candidatures à trier",
  providers: "Prestataires retenus",
  staff: "Staff",
  followers: "Abonnés de la structure",
  checked_in: "Entrés le jour J",
};

export const announcementKindLabels: Record<AnnouncementKind, string> = {
  announcement: "Annonce",
  instructions: "Consignes",
  status_change: "Statut",
  system: "Information",
};

export const announcementAudienceLabels: Record<AnnouncementAudience, string> = {
  public: "Tout le monde",
  participants: "Inscrits retenus seulement",
};

export const templateKindLabels: Record<TemplateKind, string> = {
  message: "Message groupé",
  announcement: "Annonce",
  instructions: "Consignes",
  thanks: "Remerciement",
};

/** Texte de l'entrée automatique du fil quand le statut change (Maintenu / Incertain / Annulé). */
export function statusChangeText(status: EventOutlook | "cancelled"): string {
  if (status === "cancelled") return "Événement annulé par l'équipe organisatrice.";
  return status === "uncertain"
    ? "Événement passé en Incertain : l'équipe organisatrice confirmera."
    : "Événement Maintenu : il a bien lieu.";
}

export const communicationLabels = {
  space: "Communication",
  tabInstructions: "Consignes et annonces",
  tabGroup: "Messages groupés",
  tabTemplates: "Modèles",
  tabParticipants: "Messages des participants",
  tabStaff: "Discussions du staff",
  feed: "Fil de l'événement",
  feedEmpty: "Pas encore d'annonce de l'équipe organisatrice.",
  feedPinned: "Épinglée",
  pin: "Épingler",
  unpin: "Désépingler",
  remove: "Supprimer",
  removeConfirm: "Supprimer cette entrée du fil ?",
  instructions: "Consignes",
  instructionsHint: "Envoyées aux retenus (véhicules et prestataires) par notification, et visibles sur leur accès.",
  instructionsSend: "Enregistrer et envoyer aux retenus",
  instructionsSent: "Consignes envoyées aux retenus.",
  instructionsEmpty: "Écris d'abord les consignes.",
  announcementNew: "Nouvelle annonce",
  announcementBody: "Texte de l'annonce",
  announcementNotify: "Prévenir les inscrits (notification)",
  announcementAudience: "Visible par",
  announcementPublish: "Publier l'annonce",
  announcementPublished: "Annonce publiée.",
  photo: "Photo",
  photoRemove: "Retirer la photo",
  groupNew: "Nouveau message groupé",
  groupEvent: "Événement",
  groupNoEvent: "Aucun (staff ou abonnés de la structure)",
  groupSegment: "Destinataires",
  groupTemplate: "Partir d'un modèle",
  groupNoTemplate: "Aucun modèle",
  groupSubject: "Objet (facultatif)",
  groupBody: "Message",
  groupSend: "Envoyer le message",
  groupSent: (n: number) => `Message en cours d'envoi à ${n} destinataire${n > 1 ? "s" : ""}.`,
  groupRecipients: (n: number) => `${n} destinataire${n > 1 ? "s" : ""}`,
  groupRead: (n: number) => `${n} ${n > 1 ? "ont" : "a"} lu`,
  groupHistory: "Envoyés",
  groupHistoryEmpty: "Aucun message groupé envoyé.",
  groupSending: "Envoi en cours",
  groupVariables: "Variables : {{pseudo}}, {{event.title}}, {{event.date}}, {{event.city}}, {{structure.name}}",
  groupHint:
    "Chaque destinataire reçoit le message dans sa Boîte, dans sa conversation avec la structure : les réponses arrivent dans « Messages des participants ».",
  quotaFollowers: (remaining: number, quota: number) =>
    `Abonnés : ${remaining} envoi${remaining > 1 ? "s" : ""} restant${remaining > 1 ? "s" : ""} sur ${quota} (30 jours glissants)`,
  quotaResetsAt: (date: string) => `Prochain envoi aux abonnés possible le ${date}.`,
  quotaDaily: (n: number) =>
    `${n} message${n > 1 ? "s" : ""} groupé${n > 1 ? "s" : ""} possible${n > 1 ? "s" : ""} aujourd'hui`,
  templatesOrasso: "Modèles Orasso",
  templatesMine: "Modèles de la structure",
  templateNew: "Nouveau modèle",
  templateName: "Nom du modèle",
  templateKind: "Usage",
  templateSave: "Enregistrer le modèle",
  templateUse: "Utiliser",
  templateDelete: "Supprimer le modèle",
  templateReadOnly: "Lecture seule",
  templatesEmpty: "Aucun modèle de la structure pour l'instant.",
  participantsEmpty: "Aucun message de participant pour l'instant.",
  staffPermanent: "Discussion permanente du staff",
  staffPermanentHint: "Toute l'équipe de la structure : organisateurs et staff recruté.",
  staffByEvent: "Discussions par événement",
  staffByEventHint:
    "Réservées au staff de l'événement. Fermées à J+1 (plus de nouveaux messages), lisibles par l'équipe organisatrice jusqu'à J+7.",
  staffOpen: "Ouverte",
  staffClosed: (closed: string, readable: string) => `Fermée le ${closed} · lisible jusqu'au ${readable}`,
  staffClosesAt: (date: string) => `Fermera le ${date}`,
  staffOpenChat: "Ouvrir la discussion",
  staffEmpty: "Aucune discussion d'événement (elles naissent à la publication).",
  staffDiscussion: "Discussion",
  staffDiscussionOnline: "La discussion du staff demande du réseau : les scans, eux, marchent hors ligne.",
  staffDiscussionClosed: "Fermée à J+1 : plus de nouveaux messages, et le staff ne la lit plus.",
  lastAnnouncement: "Dernière annonce",
  openMessage: "Ouvrir",
  unread: (n: number) => `${n} non lu${n > 1 ? "s" : ""}`,
  byStructure: (name: string) => `Par ${name}`,
} as const;
