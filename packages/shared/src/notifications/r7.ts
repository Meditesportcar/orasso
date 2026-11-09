import type { NotificationFamily } from "../enums";

/**
 * Vague R7 (lot R7c1, D38) : tous les types de notification de la vague sont déclarés ici, d'un coup, pour que les lots
 * suivants (stories, votes, partenariats, rendez-vous, souvenirs, direct) n'éditent pas le même fichier : chacun les
 * émet seulement.
 *
 * Drapeaux d'un type :
 * - `push` : part en notification sur l'appareil ; faux = « Journal seul » (visible dans l'Activité, jamais de push ni
 *   d'e-mail, livré tout de suite : voir `journalOnlyNotificationTypes`) ;
 * - `email` : e-mail de repli quand la personne n'a aucun appareil (sans objet pour un type `push: false`) ; faux = push
 *   et Journal seulement (voir `pushOnlyNotificationTypes`) ;
 * - `quiet` : levée des heures calmes (22 h – 8 h) pour ce type, quand le sujet est proche (voir `deliverAfter`) ;
 * - `title` / `body` : textes par défaut (`{name}` = le nom du sujet : événement, vote, personne…), que l'émetteur remplace
 *   quand il connaît mieux.
 * `vote_opened` se coupe seul dans les réglages (tous les types non `staff`/`account` se règlent un par un).
 */
export type QuietOverride = { within: number } | { days: number };

export type R7NotificationSpec = {
  family: NotificationFamily;
  label: string;
  title: string;
  body: string;
  push: boolean;
  email: boolean;
  quiet?: QuietOverride;
};

const HOUR = 3_600_000;

export const r7NotificationTable = {
  schedule_change: {
    family: "event",
    label: "Horaire d'un événement modifié",
    title: "Horaire modifié",
    body: "L'horaire de {name} a changé.",
    push: true,
    email: true,
    // Un événement aujourd'hui ou demain : l'horaire change, on prévient même la nuit.
    quiet: { days: 1 },
  },
  story_like: {
    family: "social",
    label: "Une flamme sur ma story",
    title: "{name} a aimé ta story",
    body: "{name} a aimé ta story.",
    push: false,
    email: false,
  },
  story_mention: {
    family: "social",
    label: "Identifié dans une story",
    title: "{name} t'a identifié dans une story",
    body: "{name} t'a identifié dans sa story.",
    push: true,
    email: false,
  },
  story_shared_by_organizer: {
    family: "social",
    label: "Ma story reprise par un organisateur",
    title: "{name} a repris ta story",
    body: "{name} a ajouté ta story à la sienne.",
    push: true,
    email: false,
  },
  story_published: {
    family: "social",
    label: "Une personne que je suis publie une story",
    title: "{name} a publié une story",
    body: "{name} a publié une story.",
    push: false,
    email: false,
  },
  partner_mention: {
    family: "social",
    label: "Mon partenaire cité dans une publication",
    title: "{name} te cite",
    body: "{name} t'a cité dans une publication partenaire.",
    push: false,
    email: false,
  },
  partnership_proposed: {
    family: "social",
    label: "Proposition de partenariat",
    title: "{name} te propose un partenariat",
    body: "{name} te propose un partenariat sur Orasso.",
    push: true,
    email: false,
  },
  partnership_accepted: {
    family: "social",
    label: "Partenariat accepté",
    title: "Partenariat accepté",
    body: "{name} a accepté ton partenariat.",
    push: false,
    email: false,
  },
  partnership_declined: {
    family: "social",
    label: "Partenariat refusé",
    title: "Partenariat refusé",
    body: "{name} a décliné ton partenariat.",
    push: false,
    email: false,
  },
  partnership_ended: {
    family: "social",
    label: "Partenariat terminé",
    title: "Partenariat terminé",
    body: "Ton partenariat avec {name} est terminé.",
    push: false,
    email: false,
  },
  vote_opened: {
    family: "event",
    label: "Un vote s'ouvre à l'événement",
    title: "Un vote est ouvert",
    body: "Le vote « {name} » est ouvert : tu peux voter.",
    push: true,
    email: false,
  },
  vote_won: {
    family: "event",
    label: "Un vote gagné",
    title: "Tu as gagné un vote",
    body: "Ton véhicule gagne le vote « {name} ».",
    push: true,
    email: true,
  },
  vote_podium: {
    family: "event",
    label: "Un podium de vote",
    title: "Ton véhicule est sur le podium",
    body: "Ton véhicule est sur le podium du vote « {name} ».",
    push: false,
    email: false,
  },
  memory: {
    family: "social",
    label: "Un souvenir à revivre",
    title: "Un souvenir pour toi",
    body: "Il y a un an : {name}.",
    push: true,
    email: false,
  },
  spot_meetup_new: {
    family: "social",
    label: "Un rendez-vous au spot",
    title: "{name} te donne rendez-vous",
    body: "{name} a lancé un rendez-vous au spot.",
    push: true,
    email: false,
    // Un rendez-vous du soir se publie avant 22 h ; après, il part quand même s'il commence dans les 2 heures.
    quiet: { within: 2 * HOUR },
  },
  spot_meetup_reply: {
    family: "social",
    label: "Une réponse à mon rendez-vous au spot",
    title: "{name} répond à ton rendez-vous",
    body: "{name} a répondu à ton rendez-vous au spot.",
    push: false,
    email: false,
  },
  presence_validated: {
    family: "event",
    label: "Présence validée sur place",
    title: "Présence validée",
    body: "Ta présence à {name} est validée.",
    push: false,
    email: false,
  },
} as const satisfies Record<string, R7NotificationSpec>;

type R7Table = typeof r7NotificationTable;

/** Type → famille, à répandre dans `notificationTypes`. */
export const r7NotificationTypes = Object.fromEntries(
  Object.entries(r7NotificationTable).map(([type, s]) => [type, s.family]),
) as { [K in keyof R7Table]: R7Table[K]["family"] };

/** Libellés des types (réglages des notifications). */
export const r7NotificationLabels = Object.fromEntries(
  Object.entries(r7NotificationTable).map(([type, s]) => [type, s.label]),
) as Record<keyof R7Table, string>;

const typesWhere = (keep: (s: R7NotificationSpec) => boolean): readonly string[] =>
  Object.entries(r7NotificationTable as Record<string, R7NotificationSpec>)
    .filter(([, s]) => keep(s))
    .map(([type]) => type);

/** Journal seul : ni push ni e-mail, livrés tout de suite. */
export const r7JournalOnlyTypes: readonly string[] = typesWhere((s) => !s.push);
/** Push et Journal, sans e-mail de repli. */
export const r7NoEmailTypes: readonly string[] = typesWhere((s) => s.push && !s.email);

/** Types envoyés par e-mail même quand un appareil reçoit le push (la victoire d'un vote : on la garde par écrit). */
export const r7EmailAlwaysTypes = ["vote_won"] as const satisfies readonly (keyof R7Table)[];

/** Levée des heures calmes d'un type (`undefined` : le type suit les heures calmes). */
export function r7QuietOverride(type: string): QuietOverride | undefined {
  return (r7NotificationTable as Record<string, R7NotificationSpec>)[type]?.quiet;
}

/** Titre et corps par défaut d'un type R7, `{name}` remplacé par le nom du sujet. */
export function r7DefaultContent(type: keyof R7Table, name: string): { title: string; body: string } {
  const s: R7NotificationSpec = r7NotificationTable[type];
  const fill = (text: string) => text.replaceAll("{name}", name);
  return { title: fill(s.title), body: fill(s.body) };
}
