import type { ApplicationStatus } from "../application";
import type { TransitionActor } from "../enums";

/**
 * Statuts « actifs » : la candidature occupe ou attend une place. `awaiting_member` (inscription en crew, lot 19) en
 * fait partie : elle bloque le véhicule et compte dans la limite de véhicules par personne, mais n'est ni dans la file
 * de tri ni dans la capacité (voir `capacityStatuses`).
 */
export const activeApplicationStatuses = [
  "pending",
  "accepted",
  "waitlisted",
  "offered",
  "awaiting_member",
] as const satisfies readonly ApplicationStatus[];

/** Statuts qui occupent une place de la capacité : retenue, et offre de place en cours (elle réserve la sienne). */
export const capacityStatuses = ["accepted", "offered"] as const satisfies readonly ApplicationStatus[];

export function isActiveStatus(status: ApplicationStatus): boolean {
  return (activeApplicationStatuses as readonly ApplicationStatus[]).includes(status);
}

/** Décideurs du tri : organisateur, staff de filtration autorisé à trancher, super admin. */
const DECIDERS: readonly TransitionActor[] = ["organizer", "staff", "admin"];
const USER: readonly TransitionActor[] = ["user"];
const SYSTEM: readonly TransitionActor[] = ["system"];

/**
 * Transitions autorisées (ARCHITECTURE.md § 2.1). `null` = création.
 * Les conditions (capacité, échéance, verrouillage…) sont vérifiées par le service.
 */
const TRANSITIONS: ReadonlyArray<readonly [ApplicationStatus | null, ApplicationStatus, readonly TransitionActor[]]> = [
  [null, "pending", USER],
  [null, "accepted", ["staff", "organizer"]],
  // Admission « sans sélection » : retenue d'office par le système (liste d'attente si complet).
  ["pending", "accepted", [...DECIDERS, "system"]],
  ["pending", "waitlisted", [...DECIDERS, "system"]],
  ["pending", "refused", DECIDERS],
  ["waitlisted", "accepted", DECIDERS],
  ["waitlisted", "refused", DECIDERS],
  ["waitlisted", "offered", SYSTEM],
  ["offered", "accepted", [...USER, ...DECIDERS]],
  ["offered", "withdrawn", USER],
  ["offered", "expired", SYSTEM],
  ["accepted", "withdrawn", USER],
  ["accepted", "refused", DECIDERS],
  ["pending", "withdrawn", USER],
  ["waitlisted", "withdrawn", USER],
  ["pending", "cancelled", SYSTEM],
  ["accepted", "cancelled", SYSTEM],
  ["waitlisted", "cancelled", SYSTEM],
  ["offered", "cancelled", SYSTEM],
  ["refused", "accepted", DECIDERS],
  ["refused", "waitlisted", DECIDERS],
  // Inscription en crew (lot 19, ARCHITECTURE-SUITE § 4.2) : le chef inscrit un membre (`user` = le chef), le membre
  // confirme (règlement accepté) ou dit « je ne viens pas » ; le chef peut le retirer ; la tâche d'expiration (72 h,
  // plafonnée au verrouillage) le retire ; l'annulation de l'événement l'annule.
  [null, "awaiting_member", USER],
  ["awaiting_member", "pending", USER],
  ["awaiting_member", "withdrawn", [...USER, ...SYSTEM]],
  ["awaiting_member", "cancelled", SYSTEM],
];

export function canTransition(from: ApplicationStatus | null, to: ApplicationStatus, actor: TransitionActor): boolean {
  return TRANSITIONS.some(([f, t, actors]) => f === from && t === to && actors.includes(actor));
}

/** Toutes les transitions déclarées (tests, documentation). */
export const applicationTransitions = TRANSITIONS;
