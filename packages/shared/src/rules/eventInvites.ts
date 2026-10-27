import { z } from "zod";

// Lot R6c (maquettes R6.3 à R6.7, validées par Damien le 27/10 avec tous les choix par défaut) : inviter du monde à un
// événement, et inviter quelqu'un dans son crew.
// - « Qui y va » : les personnes que tu suis (abonnement accepté) qui y vont : candidature retenue ou en cours, ou billet.
//   Jamais un refusé, un retiré, un absent ; jamais pour un visiteur sans compte ; rien après la fin de l'événement.
// - Inviter : tes abonnés, tes abonnements (acceptés) et les membres actifs de tes crews ; une invitation par personne,
//   par événement et par auteur ; 30 par jour ; pas un événement « sur invitation » de l'organisateur, ni passé, annulé
//   ou non publié. L'invitation ne réserve aucune place : chacun candidate, l'organisateur trie comme d'habitude.
// - L'invité : une notification regroupée par événement (« Kenji_66 et Julie_66 t'invitent »), un bandeau sur la fiche ;
//   il peut couper les invitations d'une personne (« ⋯ ») ou toutes (Réglages › Notifications).
// Règles pures : l'API les applique, l'appli et le site affichent le résultat sans le recalculer.

/** Le mot qui accompagne une invitation (facultatif). */
export const EVENT_INVITE_NOTE_MAX = 140;
/** Invitations à un événement envoyées par compte et par 24 heures (comptées en base). */
export const EVENT_INVITES_PER_DAY = 30;
/** Personnes d'une page de la liste « Inviter du monde ». */
export const EVENT_INVITE_PAGE_SIZE = 30;
/** Visages montrés par « Qui y va » et par la carte « Invite du monde à venir ». */
export const GOING_FACES = 3;

/**
 * Candidature qui fait « y aller » (retenue ou en cours). Refusée, désistée, expirée, annulée : jamais. Une inscription
 * de crew encore à confirmer par le membre (`awaiting_member`) ne compte pas : il n'a rien dit.
 */
export const goingApplicationStatuses = ["pending", "accepted", "waitlisted", "offered"] as const;

export const eventInviteCreateSchema = z.object({
  userIds: z.array(z.string().trim().min(1).max(64)).min(1).max(EVENT_INVITES_PER_DAY),
  note: z
    .string()
    .trim()
    .max(EVENT_INVITE_NOTE_MAX)
    .nullish()
    .transform((v) => (v ? v : null)),
});
export type EventInviteCreate = z.infer<typeof eventInviteCreateSchema>;

export const eventInviteCandidatesQuery = z.object({
  q: z.string().trim().max(40).optional(),
  cursor: z.string().max(64).optional(),
});
export type EventInviteCandidatesQuery = z.infer<typeof eventInviteCandidatesQuery>;

export const invitationMuteSchema = z.object({ userId: z.string().trim().min(1).max(64) });

/** Une personne de « Qui y va » : pseudo et avatar, rien d'autre (liste blanche). */
export type GoingPerson = { pseudo: string; avatarUrl: string | null };
export type FollowingGoing = { people: GoingPerson[]; total: number };

/** « Julie_66 y va », « Julie_66 et Nina_34 y vont », « Julie_66, Nina_34 et 2 autres y vont ». */
export function followingGoingText(pseudos: readonly string[], total: number): string {
  const [a, b] = pseudos;
  if (!a || total <= 0) return "";
  if (total === 1 || !b) return total === 1 ? `${a} y va` : `${a} et ${others(total - 1)} y vont`;
  if (total === 2) return `${a} et ${b} y vont`;
  return `${a}, ${b} et ${others(total - 2)} y vont`;
}

const others = (n: number) => `${n} ${n > 1 ? "autres" : "autre"}`;

/** Lien d'une personne de la liste avec moi, pour la légende de sa ligne. */
export type InviteRelation = { inCrew: boolean; followsMe: boolean; iFollow: boolean };

/** État d'une ligne de la liste « Inviter du monde » : cochable, « y va déjà », « déjà invité(e) par toi ». */
export type InviteCandidateState = "available" | "going" | "invited";

export type InviteCandidate = {
  userId: string;
  pseudo: string;
  avatarUrl: string | null;
  caption: string;
  state: InviteCandidateState;
  /** Mes crews dont la personne est membre (la ligne « Tout <crew> » les coche). */
  crewIds: string[];
};

export type InviteCrew = {
  id: string;
  name: string;
  logoUrl: string | null;
  membersCount: number;
  /** Membres qui y vont déjà (seulement ceux dont je peux le savoir). */
  going: number;
  /** Membres que je peux encore inviter (ni moi, ni « y va déjà », ni déjà invités par moi). */
  invitable: string[];
};

export type InviteCandidatesPage = {
  /** Mes crews (première page seulement). */
  crews: InviteCrew[];
  people: InviteCandidate[];
  nextCursor: string | null;
  remainingToday: number;
};

/**
 * Réponse de `POST /events/:id/invitations`. Une personne qui a coupé mes invitations, ou qui y va sans que je puisse le
 * savoir, compte comme invitée : la réponse est la même (rien ne lui est envoyé).
 */
export type EventInviteResult = {
  invited: number;
  /** Déjà invitées par moi à cet événement : ignorées. */
  alreadyInvited: string[];
  /** Y vont déjà (et je peux le savoir) : ignorées. */
  going: string[];
  remainingToday: number;
};

/** Le bandeau « Kenji_66 t'invite » de la fiche (`GET /events/:id/invitations/received`). */
export type ReceivedEventInvitation = {
  inviters: { userId: string; pseudo: string; avatarUrl: string | null }[];
  /** Le mot de l'invitation la plus récente. */
  note: string | null;
};

/** Personne dont j'ai coupé les invitations. */
export type InvitationMute = { userId: string; pseudo: string; avatarUrl: string | null };

/** Légende d'une ligne : « y va déjà · ton crew », « déjà invité(e) par toi », « ton crew · te suit », « abonnement ». */
export function inviteCaption(state: InviteCandidateState, rel: InviteRelation): string {
  if (state === "invited") return eventInviteLabels.invitedByYou;
  const link = rel.followsMe ? eventInviteLabels.followsMe : rel.iFollow ? eventInviteLabels.iFollow : null;
  const parts: string[] = state === "going" ? [eventInviteLabels.going] : [];
  if (rel.inCrew) parts.push(eventInviteLabels.yourCrew);
  if (link && parts.length < 2) parts.push(link);
  return parts.join(" · ");
}

/** Qui l'invitation nomme : « Kenji_66 », « Kenji_66 et Julie_66 », « Kenji_66, Julie_66 et 2 autres ». */
function inviterNames(pseudos: readonly string[], total: number): string {
  const [a, b] = pseudos;
  if (!a) return "";
  if (total <= 1 || !b) return total <= 1 ? a : `${a} et ${others(total - 1)}`;
  if (total === 2) return `${a} et ${b}`;
  return `${a}, ${b} et ${others(total - 2)}`;
}

/** Titre de la notification : « Kenji_66 t'invite à Nocturne de Canet », « … et Julie_66 t'invitent à … ». */
export function eventInvitedTitle(pseudos: readonly string[], total: number, eventTitle: string): string {
  return `${inviterNames(pseudos, total)} ${total > 1 ? "t'invitent" : "t'invite"} à ${eventTitle}`;
}

/** Bandeau de la fiche : « Kenji_66 t'invite », « Kenji_66 et Julie_66 t'invitent ». */
export function eventInvitedBanner(pseudos: readonly string[], total: number): string {
  return `${inviterNames(pseudos, total)} ${total > 1 ? "t'invitent" : "t'invite"}`;
}

/** « Inviter 3 personnes ». */
export function inviteSendLabel(n: number): string {
  return n > 0 ? `Inviter ${n} personne${n > 1 ? "s" : ""}` : eventInviteLabels.chooseSomeone;
}

/** Ce que dit l'appli après l'envoi : « 3 invitations envoyées. 1 personne y va déjà. » */
export function inviteResultText(r: Pick<EventInviteResult, "invited" | "alreadyInvited" | "going">): string {
  const parts: string[] = [];
  if (r.invited > 0)
    parts.push(`${r.invited} invitation${r.invited > 1 ? "s" : ""} envoyée${r.invited > 1 ? "s" : ""}.`);
  if (r.alreadyInvited.length > 0) {
    const n = r.alreadyInvited.length;
    parts.push(`${n} personne${n > 1 ? "s" : ""} déjà invitée${n > 1 ? "s" : ""} par toi.`);
  }
  if (r.going.length > 0) {
    const n = r.going.length;
    parts.push(`${n} personne${n > 1 ? "s y vont" : " y va"} déjà.`);
  }
  return parts.join(" ") || eventInviteLabels.nothingSent;
}

export const eventInviteLabels = {
  whoGoes: "Qui y va",
  whoGoesHint: "parmi ceux que tu suis",
  invite: "Inviter du monde",
  inviteA11y: "Inviter du monde à cet événement",
  noPlace: "Une invitation ne réserve pas de place : chacun candidate, l'organisateur trie comme d'habitude.",
  sheetTitle: (title: string) => `Inviter à ${title}`,
  search: "Chercher parmi ceux que tu suis",
  searchA11y: "Chercher une personne",
  yourCrews: "Ton crew",
  allCrew: (name: string) => `Tout ${name}`,
  crewCaption: (members: number, going: number) =>
    `${members} membre${members > 1 ? "s" : ""}${going > 0 ? ` · ${going} y ${going > 1 ? "vont" : "va"} déjà` : ""}`,
  network: "Ceux que tu suis, et qui te suivent",
  note: "Un mot",
  noteOptional: "facultatif",
  notePlaceholder: "On y va avec le crew, viens !",
  chooseSomeone: "Choisis qui inviter",
  chooseHint: "Coche au moins une personne pour l'inviter.",
  more: "Voir plus",
  going: "y va déjà",
  invitedByYou: "déjà invité(e) par toi",
  yourCrew: "ton crew",
  followsMe: "te suit",
  iFollow: "abonnement",
  empty: "Personne à inviter pour l'instant : suis des passionnés ou rejoins un crew.",
  noMatch: "Personne de ton réseau ne commence par ces lettres.",
  remaining: (n: number) => `Encore ${n} invitation${n > 1 ? "s" : ""} possible${n > 1 ? "s" : ""} aujourd'hui.`,
  nothingSent: "Aucune invitation envoyée.",
  loadError: "Liste indisponible.",
  retry: "Réessayer",
  // Erreurs (API).
  notInNetwork: "Tu peux inviter tes abonnés, tes abonnements et les membres de tes crews.",
  inviteOnly: "Cet événement est sur invitation de l'organisateur : il ne se partage pas.",
  closed: "Cet événement est passé, annulé ou pas encore publié : il ne se partage plus.",
  selfInvite: "C'est ton propre compte.",
  perDay: (remaining: number) =>
    remaining > 0
      ? `Tu peux encore inviter ${remaining} personne${remaining > 1 ? "s" : ""} aujourd'hui.`
      : `Tu as invité ${EVENT_INVITES_PER_DAY} personnes aujourd'hui : réessaie demain.`,
  // Après la candidature (R6.5).
  afterTitle: "Invite du monde à venir",
  afterText: "Ton crew et ceux que tu suis. Chacun candidate de son côté.",
  afterButton: "Inviter",
  afterClose: "Fermer la carte",
  // L'invité (R6.6).
  menuTitle: (pseudo: string) => `Invitation de ${pseudo}`,
  mute: (pseudo: string) => `Ne plus recevoir d'invitations de ${pseudo}`,
  muteHint: "Rien d'autre ne change ; ses invitations ne t'arrivent plus.",
  unmute: (pseudo: string) => `Recevoir de nouveau les invitations de ${pseudo}`,
  muted: (pseudo: string) => `Les invitations de ${pseudo} ne t'arrivent plus.`,
  unmuted: (pseudo: string) => `Les invitations de ${pseudo} t'arrivent de nouveau.`,
  settings: "Réglages des invitations",
  settingsHint: "Réglages › Notifications : invitations, oui ou non",
  report: "Signaler",
  seeEvent: "Voir la fiche",
  moreA11y: "Plus d'options sur cette invitation",
  // Notification.
  notificationLink: "Voir la fiche",
} as const;

/**
 * Lot R6c (maquette R6.7) : inviter quelqu'un dans son crew. Tout membre actif invite une personne de son réseau ; si elle
 * accepte, le chef confirme son arrivée (« Invitée par Julie_66 », dans les demandes). Une invitation du chef fait
 * entrer tout de suite, comme avant.
 */
export type CrewInviteCandidateState = "available" | "member" | "invited" | "requested";

export type CrewInviteCandidate = {
  userId: string;
  pseudo: string;
  avatarUrl: string | null;
  caption: string;
  state: CrewInviteCandidateState;
};

export type CrewInviteCandidatesPage = { people: CrewInviteCandidate[]; nextCursor: string | null };

export const crewInviteLabels = {
  sheetTitle: (crew: string) => `Inviter dans ${crew}`,
  search: "Chercher parmi ceux que tu suis",
  invite: "Inviter",
  inviteA11y: (pseudo: string) => `Inviter ${pseudo}`,
  inviteSomeone: "Inviter quelqu'un",
  byPseudo: "Ou par pseudo",
  leaderConfirms: (leader: string) =>
    `Si la personne accepte, ${leader}, le chef, confirme son arrivée. Une invitation du chef la fait entrer tout de suite.`,
  leaderDirect: "Une invitation du chef fait entrer tout de suite : la personne n'a qu'à accepter.",
  sentTitle: (pseudo: string) => `Invitation envoyée à ${pseudo}`,
  sentByMember: (leader: string) => `Si la personne accepte, ${leader}, le chef, confirme son arrivée.`,
  sentByLeader: "Si la personne accepte, elle entre tout de suite dans le crew.",
  invitedBy: (pseudo: string) => `Invité(e) par ${pseudo}`,
  alreadyInvited: "déjà invité(e)",
  alreadyRequested: "a déjà demandé à rejoindre",
  member: "déjà membre",
  empty: "Personne à inviter pour l'instant : suis des passionnés pour les inviter.",
  noMatch: "Personne de ton réseau ne commence par ces lettres.",
  notInNetwork: "Tu peux inviter tes abonnés et tes abonnements.",
  // Notifications.
  memberInviteBody: (inviter: string, crew: string, leader: string) =>
    `${inviter} t'invite à rejoindre « ${crew} ». Si tu acceptes, ${leader}, le chef, confirme ton arrivée.`,
  confirmTitle: "Arrivée à confirmer",
  confirmBody: (person: string, inviter: string, crew: string) =>
    `${person} a accepté l'invitation de ${inviter} dans « ${crew} » : confirme son arrivée.`,
  /** Côté invité, après avoir accepté : le chef doit confirmer. */
  waitingLeader: "Le chef confirme ton arrivée : tu seras prévenu(e).",
  leaderFallback: "le chef",
  memberFallback: "un membre",
} as const;
