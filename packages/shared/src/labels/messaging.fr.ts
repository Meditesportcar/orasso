// Messagerie et Boîte (lot 18) : libellés d'interface (appli et site).

export const messagingLabels = {
  inbox: "Boîte",
  /** Segment « Tout » de la Boîte (le Journal). */
  all: "Tout",
  messages: "Messages",
  requests: "Demandes",
  noConversations:
    "Aucune conversation pour l'instant. Écris à quelqu'un qui te suit depuis son profil, ou contacte un organisateur.",
  noRequests: "Aucune demande en attente.",
  message: "Message",
  send: "Envoyer",
  photo: "Photo",
  placeholder: "Écrire un message…",
  sending: "Envoi…",
  retry: "Réessayer",
  notSent: "Non envoyé : nouvel essai dès que le réseau revient.",
  deleted: "Message supprimé",
  deleteMessage: "Supprimer le message",
  deleteConfirm: "Supprimer ce message pour tout le monde ?",
  report: "Signaler",
  reportSoon: "Signaler · bientôt",
  readBy: (pseudos: string[]) => `Lu par ${pseudos.join(", ")}`,
  read: "Lu",
  deletedAccount: "Compte supprimé",
  byPseudo: (structure: string, pseudo: string) => `${structure} · par ${pseudo}`,
  olderMessages: "Messages plus anciens",
  today: "Aujourd'hui",
  closeConversation: "Fermer",
  viewProfile: "Voir le profil",
  openImage: "Agrandir la photo",
  closeImage: "Fermer la photo",
  imageTooLarge: "Photo trop lourde (15 Mo au plus).",
  contactOrganizer: "Contacter l'équipe organisatrice",
  /** Lot M4 : étiquette d'un message écrit depuis la fiche d'un événement, et la feuille « Écrire à ». */
  aboutEvent: "À propos de",
  writeTo: (name: string) => `Écrire à ${name}`,
  aboutEventHint:
    "L'organisateur voit tout de suite de quel événement tu parles. Cette étiquette reste dans la conversation, des deux côtés.",
  yourMessage: "Ton message",
  sent: "Message envoyé : la réponse arrivera dans ta Boîte.",
  openConversation: "Ouvrir la conversation",
  /** Tour 2 : envoi sans réponse (réseau) : le même message repart, sans doublon. */
  sendPending: "Le message n'est peut-être pas parti : « Envoyer » le renvoie tel quel, sans doublon.",
  aboutEventNotHere: "Cet événement n'est pas organisé par cette structure",
  structureSuspended: "Cette structure est suspendue.",
  contactRequest: "Demande de contact",
  contactRequestHint:
    "Cette personne ne te suit pas : ton message part en demande de contact, rangée à part. Une seule demande est possible.",
  contactRequestPlaceholder: "Présente-toi et dis pourquoi tu écris…",
  contactRequestSend: "Envoyer la demande",
  contactRequestSent: (pseudo: string) => `Demande de contact envoyée à ${pseudo}`,
  contactRequestFrom: "Demande de contact",
  accept: "Accepter",
  decline: "Refuser",
  pendingOut: "Demande envoyée",
  writeBlocked: {
    not_friends:
      "Cette personne ne te suit plus : la conversation reste lisible. Pour écrire, envoie une demande de contact.",
    closed: "Cette conversation est fermée : plus de nouveaux messages.",
    suspended: "Ton compte est suspendu : lecture seule.",
    account_deleted: "Ce compte a été supprimé : la conversation reste lisible.",
    two_factor: "Double authentification obligatoire pour répondre au nom de la structure.",
    structure_suspended: "Cette structure est suspendue : la conversation reste lisible.",
  },
} as const;

/**
 * Libellés des messages `system` ; les lots 19 et 20 ajoutent les leurs. Le corps d'un message `system` est un JSON
 * `{"code": "...", "pseudo": "..." | null}` (`pseudo` effacé si le compte est supprimé) ; `{pseudo}` est remplacé.
 */
export const systemMessageLabels: Record<string, string> = {
  // Lot 19 : discussion d'un crew.
  crew_created: "Crew créé par {pseudo}.",
  crew_member_joined: "{pseudo} a rejoint le crew.",
  crew_member_left: "{pseudo} a quitté le crew.",
  crew_member_removed: "{pseudo} ne fait plus partie du crew.",
  crew_archived: "Ce crew est dissous : la discussion reste lisible.",
};

/** Texte d'un message `system` (« Léa a rejoint le crew. »), ou « Information » si le code est inconnu. */
export function systemMessageText(body: string | null): string {
  try {
    const parsed = JSON.parse(body ?? "") as { code?: unknown; pseudo?: unknown };
    const label = typeof parsed.code === "string" ? systemMessageLabels[parsed.code] : undefined;
    if (!label) return "Information";
    return label.replace("{pseudo}", typeof parsed.pseudo === "string" && parsed.pseudo ? parsed.pseudo : "Un membre");
  } catch {
    return "Information";
  }
}
