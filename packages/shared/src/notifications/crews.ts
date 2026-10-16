import type { NotificationFamily } from "../enums";

/**
 * Crews (lot 19, ARCHITECTURE-SUITE § 4.3) : famille `social` (« Amis et messages »), sauf la venue à confirmer, qui
 * est une candidature (famille `application`) : un membre qui coupe le social ne doit pas laisser passer son délai sans
 * le savoir. `crew_archived` : le crew est dissous (son chef a supprimé son compte, S15).
 */
export const crewNotificationTypes = {
  crew_request: "social",
  crew_invitation: "social",
  crew_request_accepted: "social",
  crew_member_joined: "social",
  crew_archived: "social",
  crew_registration_to_confirm: "application",
  crew_member_confirmed: "social",
  crew_member_declined: "social",
  crew_member_expired: "social",
} as const satisfies Record<string, NotificationFamily>;

export const crewNotificationLabels: Record<keyof typeof crewNotificationTypes, string> = {
  crew_request: "Demande pour rejoindre mon crew",
  crew_invitation: "Invitation à un crew",
  crew_request_accepted: "Demande de crew acceptée",
  crew_member_joined: "Nouveau membre dans mon crew",
  crew_archived: "Crew dissous",
  crew_registration_to_confirm: "Venue en crew à confirmer",
  crew_member_confirmed: "Un membre confirme sa venue en crew",
  crew_member_declined: "Un membre ne vient pas",
  crew_member_expired: "Un membre n'a pas confirmé à temps",
};
