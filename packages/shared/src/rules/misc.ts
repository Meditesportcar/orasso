import { type Grade, grades } from "../grades";

/** Seuils de grade (choix C11, provisoires : à revoir avec Damien, A6). */
export const GRADE_THRESHOLDS: Record<Grade, number> = {
  rodage: 0,
  route: 100,
  sport: 300,
  circuit: 400,
  legende: 800,
};

/** Plus haut grade dont le seuil est atteint (seuils administrables depuis le lot 33, constantes par défaut). */
export function gradeFor(points: number, thresholds: Record<Grade, number> = GRADE_THRESHOLDS): Grade {
  let result: Grade = "rodage";
  for (const g of grades) if (points >= thresholds[g]) result = g;
  return result;
}

// `normalizePlate` (forme unique d'une plaque) vit dans `plateNumber.ts` depuis le lot M2, tour 2.

/** Éligibilité d'un véhicule à une catégorie d'après son âge (youngtimer ≥ 20 ans, ancienne ≥ 30 ans). */
export function categoryAllowedForYear(minVehicleAge: number | null, year: number | null, now: Date): boolean {
  if (minVehicleAge === null) return true;
  if (year === null) return false;
  return now.getUTCFullYear() - year >= minVehicleAge;
}
