import type { BadgeStatus } from "@orasso/design-system/web";
import type { ApplicationStatus, EventPublic } from "@orasso/shared";

/** Statut d'une candidature → pastille du système de design (`null` : pas de pastille, un libellé suffit). */
export function badgeFor(app: {
  status: ApplicationStatus;
  checkedInAt?: string | null;
  waitlistRank?: number | null;
}): { status: BadgeStatus; rank?: number } | null {
  switch (app.status) {
    case "pending":
      return { status: "pending" };
    case "accepted":
      return { status: app.checkedInAt ? "onsite" : "retained" };
    case "waitlisted":
    case "offered":
      return { status: "waitlist", rank: app.waitlistRank ?? undefined };
    case "refused":
      return { status: "refused" };
    case "cancelled":
      return { status: "cancelled" };
    default:
      return null;
  }
}

export type RegistrationState =
  | { kind: "open" }
  | { kind: "not_open"; opensAt: string }
  | { kind: "locked" }
  | { kind: "cancelled" };

export function registrationState(event: EventPublic, nowMs: number): RegistrationState {
  if (event.status === "cancelled") return { kind: "cancelled" };
  if (event.isLocked) return { kind: "locked" };
  const opensAt = event.registrationOpensAtForMe ?? event.registrationsOpenAt;
  if (new Date(opensAt).getTime() > nowMs) return { kind: "not_open", opensAt };
  return { kind: "open" };
}
