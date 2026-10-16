import { type Grade, grades } from "../grades";

// Invitations nominatives et avantages des hauts grades (lot 25, ARCHITECTURE-SUITE § 9).

/** Cibles par envoi (personnes, véhicules, adresses e-mail confondues). */
export const INVITATIONS_PER_REQUEST = 50;
/** Invitations créées par une structure en 24 h glissantes (toutes cibles, « Inviter les retenus » compris). */
export const INVITATIONS_PER_STRUCTURE_PER_DAY = 300;
/** Dont adresses e-mail sans compte (chaque adresse reçoit un e-mail : budget Brevo de tout Orasso). */
export const EMAIL_INVITATIONS_PER_STRUCTURE_PER_DAY = 50;
/** Message de l'organisateur joint à l'invitation. */
export const INVITATION_MESSAGE_MAX = 500;

/** Rang d'un grade (0 = Rodage). */
export const gradeRank = (g: Grade): number => grades.indexOf(g);

/** Grade au moins égal au seuil de l'organisateur (« hauts grades », docs/01 « Points et grades »). */
export const isHighGrade = (grade: Grade, min: Grade): boolean => gradeRank(grade) >= gradeRank(min);

export type HighGradeRule = { highGradePriority: boolean; highGradeMin: Grade };
export type WaitlistEntry = { rank: number; grade: Grade };

/**
 * Rang d'insertion dans la liste d'attente (§ 9.2). Sans priorité, ou pour un grade sous le seuil : à la fin
 * (`max + 1`). Avec priorité, pour un haut grade : juste après la dernière candidature de haut grade (rang de celle-ci
 * + 1, ou 1 s'il n'y en a pas), donc devant les grades inférieurs et derrière les hauts grades arrivés avant ; les
 * candidatures de rang ≥ au rang rendu reculent d'une place (fait par l'appelant).
 */
export function waitlistInsertRank(entries: readonly WaitlistEntry[], grade: Grade, rule: HighGradeRule): number {
  const last = entries.reduce((m, e) => Math.max(m, e.rank), 0);
  if (!rule.highGradePriority || !isHighGrade(grade, rule.highGradeMin)) return last + 1;
  const lastHigh = entries.reduce((m, e) => (isHighGrade(e.grade, rule.highGradeMin) ? Math.max(m, e.rank) : m), 0);
  return lastHigh + 1;
}
