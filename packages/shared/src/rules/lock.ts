import { MINUTE } from "./time";

/** Ce qu'il faut d'un événement pour connaître son verrouillage (ARCHITECTURE.md § 2.3). */
export type LockableEvent = { startsAt: Date; lockOffsetMinutes: number };

/** Instant du verrouillage des inscriptions : début − délai (2 h par défaut, réglable). */
export function lockAt(event: LockableEvent): Date {
  return new Date(event.startsAt.getTime() - event.lockOffsetMinutes * MINUTE);
}

/** Source de vérité du verrouillage (`events.locked_at` n'est qu'une trace). */
export function isLocked(event: LockableEvent, now: Date): boolean {
  return now.getTime() >= lockAt(event).getTime();
}
