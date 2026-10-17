import type { EventStatus } from "../enums";
import type { Grade } from "../grades";
import { isHighGrade } from "./invitations";
import { isLocked, type LockableEvent } from "./lock";
import { HOUR } from "./time";

export type RegistrationEvent = LockableEvent & {
  status: EventStatus;
  registrationsOpenAt: Date;
  previewHours: number;
  /** Avant-première des hauts grades (lot 25) : 0 = aucune. */
  highGradePreviewHours?: number;
  highGradeMin?: Grade;
};

/** Qui candidate : abonné de la structure, et son grade de la saison (avant-première des hauts grades). */
export type Applicant = { follower: boolean; grade?: Grade | null };

const applicantOf = (who: boolean | Applicant): Applicant => (typeof who === "boolean" ? { follower: who } : who);

/** Avant-première dont la personne bénéficie, en heures (S26 : la plus longue l'emporte, pas d'addition). */
export function previewHoursFor(event: RegistrationEvent, who: boolean | Applicant): number {
  const a = applicantOf(who);
  const follower = a.follower ? event.previewHours : 0;
  const high =
    a.grade && event.highGradePreviewHours && isHighGrade(a.grade, event.highGradeMin ?? "circuit")
      ? event.highGradePreviewHours
      : 0;
  return Math.max(follower, high);
}

/**
 * Ouverture des inscriptions pour une personne (ARCHITECTURE.md § 2.4, ARCHITECTURE-SUITE § 9.2) : avant-première des
 * abonnés et des hauts grades, la plus longue des deux. `who` booléen = abonné ou non (sans grade), comme avant le lot 25.
 */
export function registrationOpensAt(event: RegistrationEvent, who: boolean | Applicant): Date {
  return new Date(event.registrationsOpenAt.getTime() - previewHoursFor(event, who) * HOUR);
}

export type ApplyCheck = { ok: true } | { ok: false; reason: "not_published" | "not_open" | "locked" };

export function canApply(event: RegistrationEvent, who: boolean | Applicant, now: Date): ApplyCheck {
  if (event.status !== "published") return { ok: false, reason: "not_published" };
  if (isLocked(event, now)) return { ok: false, reason: "locked" };
  if (now.getTime() < registrationOpensAt(event, who).getTime()) return { ok: false, reason: "not_open" };
  return { ok: true };
}
