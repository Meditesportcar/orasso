import type { ApplicationStatus } from "../application";
import type { TransitionActor } from "../enums";

/** Statuts « actifs » : la candidature occupe ou attend une place. */
export const activeApplicationStatuses = [
  "pending",
  "accepted",
  "waitlisted",
  "offered",
] as const satisfies readonly ApplicationStatus[];

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
  ["pending", "accepted", DECIDERS],
  ["pending", "waitlisted", DECIDERS],
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
];

export function canTransition(from: ApplicationStatus | null, to: ApplicationStatus, actor: TransitionActor): boolean {
  return TRANSITIONS.some(([f, t, actors]) => f === from && t === to && actors.includes(actor));
}

/** Toutes les transitions déclarées (tests, documentation). */
export const applicationTransitions = TRANSITIONS;
