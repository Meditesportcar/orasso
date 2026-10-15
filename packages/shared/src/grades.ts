import { z } from "zod";

/** Grades par saison, du plus bas au plus haut (docs/01, « Points et grades »). */
export const grades = ["rodage", "route", "sport", "circuit", "legende"] as const;

export const gradeSchema = z.enum(grades);
export type Grade = z.infer<typeof gradeSchema>;

export const gradeLabels: Record<Grade, string> = {
  rodage: "Rodage",
  route: "Route",
  sport: "Sport",
  circuit: "Circuit",
  legende: "Légende",
};
