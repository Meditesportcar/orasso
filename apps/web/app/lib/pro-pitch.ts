// Carte « la fiche en vrai » de `/professionnels` (lot 56) : ce qu'elle a le droit d'afficher. Un vrai pro de l'annuaire
// montre ses remises réelles (ou leur absence) et le badge seulement s'il est vérifié ; les pourcentages de présentation
// ne servent que sur une carte clairement fictive (sans pro publié). Pur : testé sans navigateur.
import { discountForGrade, type Grade, grades, type ProDiscounts, proPitchDiscounts } from "@orasso/shared";

export type ProPitchSource = { verified: boolean; discounts: ProDiscounts } | null;

export type ProPitchCard = {
  /** Carte d'exemple inventée (aucun pro publié) : marquée « Exemple », avec les pourcentages de présentation. */
  fictional: boolean;
  /** Badge « Pro validé » : seulement pour un vrai pro vérifié. */
  badge: boolean;
  /** Remises montrées : celles du pro (seulement les grades remisés), ou les quatre grades de l'exemple. */
  discounts: { grade: Grade; percent: number }[];
};

export function proPitchCard(sample: ProPitchSource): ProPitchCard {
  if (!sample) {
    return {
      fictional: true,
      badge: false,
      discounts: grades.filter((g) => g !== "legende").map((g) => ({ grade: g, percent: proPitchDiscounts[g] })),
    };
  }
  return {
    fictional: false,
    badge: sample.verified,
    discounts: grades
      .map((g) => ({ grade: g, percent: discountForGrade(sample.discounts, g) }))
      .filter((d) => d.percent > 0),
  };
}
