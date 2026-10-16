import { HOUR } from "./time";

// Crews (lot 19, ARCHITECTURE-SUITE § 4) : règles pures. L'API les applique ; l'appli et le site affichent le résultat
// sans le recalculer.

/** Rôle dans un crew : le chef (créateur, pas de transfert en V1, S15) et les membres. */
export const crewRoles = ["leader", "member"] as const;
export type CrewRole = (typeof crewRoles)[number];

/**
 * Une ligne par paire crew-personne, pour toujours (clé primaire) : `invited` (le chef a invité), `requested` (la
 * personne a demandé), `active`, `left` (est partie), `removed` (retirée par le chef), `declined` (demande refusée par le
 * chef, ou invitation refusée par la personne).
 */
export const crewMemberStatuses = ["invited", "requested", "active", "left", "removed", "declined"] as const;
export type CrewMemberStatus = (typeof crewMemberStatuses)[number];

/** S14 : crews actifs par personne (chef compris), membres actifs par crew. */
export const CREWS_PER_PERSON = 5;
export const MEMBERS_PER_CREW = 50;
/** Invitations en attente par crew (§ 4.3). */
export const PENDING_INVITATIONS_PER_CREW = 20;
export const CREW_NAME_MIN = 3;
export const CREW_NAME_MAX = 40;
export const CREW_DESCRIPTION_MAX = 500;
export const CREW_REQUEST_MESSAGE_MAX = 300;
/** Un refus (demande ou invitation) ou un retrait bloque une nouvelle demande de la même paire pendant 30 jours. */
export const CREW_COOLDOWN_DAYS = 30;
/** S17 : délai de confirmation d'un membre inscrit par son chef. */
export const CREW_CONFIRM_HOURS = 72;
/** Demandes pour rejoindre un crew, par personne et par jour (comptées en base). */
export const CREW_REQUESTS_PER_DAY = 10;
/** Créations de crew par personne et par jour (comptées en base). */
export const CREW_CREATIONS_PER_DAY = 3;

/** Échéance de confirmation d'un membre : 72 h après l'inscription, jamais après le verrouillage (S17). */
export function crewConfirmDeadline(createdAt: Date, lockAt: Date): Date {
  return new Date(Math.min(createdAt.getTime() + CREW_CONFIRM_HOURS * HOUR, lockAt.getTime()));
}

export type CrewMemberRowLike = { status: CrewMemberStatus; respondedAt: Date | null };

/** Le refus ou le retrait date de moins de 30 jours. */
export function crewCooldownActive(row: Pick<CrewMemberRowLike, "respondedAt">, at: Date): boolean {
  const since = row.respondedAt ? at.getTime() - row.respondedAt.getTime() : Number.POSITIVE_INFINITY;
  return since < CREW_COOLDOWN_DAYS * 86_400_000;
}

/** Relation d'une personne avec un crew, vue par elle (boutons de la fiche). */
export type CrewViewerState = "none" | "requested" | "invited" | "member" | "leader";

/**
 * État vu par la personne elle-même. Le refus d'une demande par le chef est silencieux : pour elle, la demande reste
 * « envoyée » pendant 30 jours (comme une demande d'ami, S7), puis elle peut redemander.
 */
export function crewViewerState(
  row: (CrewMemberRowLike & { role: CrewRole; requestedByMe: boolean }) | null,
  at: Date,
) {
  if (!row) return "none" as const;
  if (row.status === "active") return row.role === "leader" ? ("leader" as const) : ("member" as const);
  if (row.status === "requested") return "requested" as const;
  if (row.status === "invited") return "invited" as const;
  if (row.status === "declined" && row.requestedByMe && crewCooldownActive(row, at)) return "requested" as const;
  return "none" as const;
}

export type CrewJoinOutcome =
  /** Créer ou rouvrir la ligne en demande (ou en invitation). */
  | { kind: "open" }
  /** L'autre côté a déjà fait le pas (invitation reçue / demande reçue) : la demande vaut acceptation. */
  | { kind: "accept" }
  | { kind: "error"; code: "already_member" | "already_pending" | "cooldown" };

/**
 * Que faire d'une demande pour rejoindre (`side = "request"`, par la personne) ou d'une invitation (`side = "invite"`,
 * par le chef), d'après la ligne existante :
 * - aucune ligne, ou partie (`left`) → ouvrir ;
 * - déjà membre → `already_member` ; même démarche en cours → `already_pending` ;
 * - démarche inverse en cours (invitation reçue pour une demande, demande reçue pour une invitation) → acceptation ;
 * - refusée ou retirée depuis moins de 30 jours → `cooldown` (une demande refusée reste « envoyée » côté demandeur) ;
 *   au-delà → ouvrir.
 */
export function crewJoinOutcome(
  row: (CrewMemberRowLike & { wasInvitation: boolean }) | null,
  side: "request" | "invite",
  at: Date,
): CrewJoinOutcome {
  if (!row || row.status === "left") return { kind: "open" };
  if (row.status === "active") return { kind: "error", code: "already_member" };
  if (row.status === (side === "request" ? "requested" : "invited")) return { kind: "error", code: "already_pending" };
  if (row.status === (side === "request" ? "invited" : "requested")) return { kind: "accept" };
  // Le délai ne vaut que pour celui qui insiste : le chef qui a refusé une demande peut inviter, la personne qui a
  // refusé une invitation peut demander ; un membre retiré ne redemande pas avant 30 jours (le chef peut le réinviter).
  const insisting =
    row.status === "removed" ? side === "request" : side === "request" ? !row.wasInvitation : row.wasInvitation;
  return insisting && crewCooldownActive(row, at) ? { kind: "error", code: "cooldown" } : { kind: "open" };
}

/** Nom de crew comparé sans casse ni espaces superflus (unicité « Roussillon Drift » = « roussillon  drift »). */
export function normalizeCrewName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}
