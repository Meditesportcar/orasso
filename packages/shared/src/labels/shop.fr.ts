// Staff côté site, rôle boutique, compléments du jour J (lot 24).
import type { TicketRefusal } from "../qr/ticket";

/** Raison d'un billet refusé (écran de scan de la boutique, rapport du serveur). */
export const ticketRefusalLabels: Record<TicketRefusal, string> = {
  malformed: "Ce n'est pas un billet Orasso",
  unknown_key: "Clé inconnue : synchronise",
  forged: "Billet falsifié",
  other_event: "Billet d'un autre événement",
  cancelled: "Billet annulé",
};

export const shopLabels = {
  tile: "Contrôle des billets",
  title: "Contrôle des billets · billets et compteur",
  scanTitle: "Contrôle des billets",
  scanHint: "Vise le QR du billet du visiteur",
  ticketOk: "Billet OK",
  ticketAlready: "Déjà utilisé",
  ticketRefused: "Refusé",
  ticketUnlisted: "Billet valide, absent de ta liste : synchronise quand tu as du réseau",
  visitors: "Visiteurs",
  visitorsLocal: "Sur ce téléphone",
  visitorsServer: "Total de l'événement",
  ticketsChecked: "Billets contrôlés",
  noList: "Les billets ne sont pas encore sur ce téléphone : synchronise avec du réseau.",
  disabled: "Le rôle « Contrôle des billets » n'est pas activé pour cet événement.",
  noRole: "Tu n'as pas le rôle « Contrôle des billets » sur cet événement.",
  /** Réglage de l'assistant d'événement. */
  wizardCheckbox: "Rôle « Contrôle des billets » sur cet événement",
  wizardHint:
    "Active la tuile « Contrôle des billets » du mode staff : contrôle des billets du public et compteur des arrivées de visiteurs.",
} as const;

export const staffRequestLabels = {
  becomeStaff: "Devenir staff",
  sent: "Demande de staff envoyée",
  pending: "Demande en attente de réponse de l'équipe organisatrice",
  invited: "Invitation reçue",
  accepted: "Demande acceptée",
  alreadyMember: "Tu fais déjà partie de cette structure.",
  cooldown: "Une demande récente n'a pas abouti : réessaie demain.",
  tooMany: "Cette structure a déjà beaucoup de demandes en attente : réessaie plus tard.",
  banned: "Cette structure ne peut pas recevoir ta demande.",
} as const;

export const liveLabels = {
  byCategory: "Arrivés par catégorie",
  providers: "Prestataires arrivés",
  visitors: "Visiteurs",
  tickets: "Billets contrôlés",
  alertPosition: "Voir sur la carte",
  alertOpen: "Alerte en cours",
  alertClosed: "Alerte close · position effacée",
  noPosition: "Position non partagée",
  incidentPhoto: "Photo jointe",
} as const;

/** « à 240 m de l'entrée », « à 1,3 km de l'entrée ». */
export function distanceFromEntryLabel(meters: number | null): string | null {
  if (meters === null || !Number.isFinite(meters)) return null;
  if (meters < 1000) return `à ${Math.max(10, Math.round(meters / 10) * 10)} m de l'entrée`;
  return `à ${(meters / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km de l'entrée`;
}
