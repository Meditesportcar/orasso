import type { EventAdmission, EventStatus } from "../enums";
import { HOUR } from "./time";

/**
 * Pourquoi une personne ne peut pas candidater maintenant (lot 36, retour de Damien : « donner la raison ») : la page de
 * l'événement du site et celle de l'appli affichent la même raison, avec sa date quand elle en a une. Fonction pure ;
 * l'API garde ses propres contrôles (`canApply`, liste noire, véhicule…), dont les messages disent aussi la raison.
 */
export type RegistrationBlock =
  | { code: "draft" }
  | { code: "cancelled" }
  | { code: "ended" }
  | { code: "invite_only" }
  /** Verrouillage (H-2 par défaut) : la liste d'accès est figée pour le staff. */
  | { code: "locked"; at: string; offsetMinutes: number }
  /** Avant-première en cours, réservée aux abonnés (et aux hauts grades) : ouverture à tous plus tard. */
  | { code: "preview"; opensAt: string; highGrades: boolean }
  /** Les candidatures ne sont pas encore ouvertes pour cette personne. */
  | { code: "not_open"; opensAt: string };

export type RegistrationBlockEvent = {
  status: EventStatus;
  startsAt: string;
  endsAt: string;
  lockAt: string;
  admission: EventAdmission;
  registrationsOpenAt: string;
  /** Ouverture pour la personne connectée (avant-première comprise) ; absente hors connexion. */
  registrationOpensAtForMe?: string;
  previewHours: number;
  highGradePreviewHours: number;
};

/**
 * La raison du blocage, ou `null` si la personne peut candidater. Un événement complet ne bloque pas : la candidature
 * passe par la liste d'attente (`admitOpen` de l'API), comme sur le site.
 */
export function registrationBlock(e: RegistrationBlockEvent, nowMs: number): RegistrationBlock | null {
  if (e.status === "draft") return { code: "draft" };
  if (e.status === "cancelled") return { code: "cancelled" };
  if (Date.parse(e.endsAt) <= nowMs) return { code: "ended" };
  if (e.admission === "invite_only") return { code: "invite_only" };
  const lock = Date.parse(e.lockAt);
  if (nowMs >= lock) {
    return {
      code: "locked",
      at: e.lockAt,
      offsetMinutes: Math.max(0, Math.round((Date.parse(e.startsAt) - lock) / 60_000)),
    };
  }
  const forMe = Date.parse(e.registrationOpensAtForMe ?? e.registrationsOpenAt);
  if (nowMs < forMe) {
    const longest = Math.max(e.previewHours, e.highGradePreviewHours);
    const previewStart = Date.parse(e.registrationsOpenAt) - longest * HOUR;
    if (longest > 0 && nowMs >= previewStart) {
      return { code: "preview", opensAt: e.registrationsOpenAt, highGrades: e.highGradePreviewHours > 0 };
    }
    return { code: "not_open", opensAt: new Date(forMe).toISOString() };
  }
  return null;
}
