import type { EventStatus } from "../enums";
import { isLocked, type LockableEvent } from "./lock";
import { HOUR } from "./time";

export type RegistrationEvent = LockableEvent & {
  status: EventStatus;
  registrationsOpenAt: Date;
  previewHours: number;
};

/** Ouverture des inscriptions pour un utilisateur : avant-première des abonnés (ARCHITECTURE.md § 2.4). */
export function registrationOpensAt(event: RegistrationEvent, isFollower: boolean): Date {
  const preview = isFollower ? event.previewHours * HOUR : 0;
  return new Date(event.registrationsOpenAt.getTime() - preview);
}

export type ApplyCheck = { ok: true } | { ok: false; reason: "not_published" | "not_open" | "locked" };

export function canApply(event: RegistrationEvent, isFollower: boolean, now: Date): ApplyCheck {
  if (event.status !== "published") return { ok: false, reason: "not_published" };
  if (isLocked(event, now)) return { ok: false, reason: "locked" };
  if (now.getTime() < registrationOpensAt(event, isFollower).getTime()) return { ok: false, reason: "not_open" };
  return { ok: true };
}
