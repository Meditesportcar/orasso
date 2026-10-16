// Couleurs de texte posé sur une plaque graphite. La plaque est graphite dans les deux thèmes, mais les couleurs
// « texte » du Sable (moutarde foncée, rouge foncé) sont faites pour le fond sable clair : sur la plaque elles tombent
// à 2,0:1 et 1,5:1 (recette du lot 12, WCAG). On prend celles du Béton, faites pour le graphite (moutarde 6:1, rouge
// 4,8:1 en Béton et 4,0:1 sur la plaque translucide du Sable : à revoir avec Damien), comme
// le système de design le fait déjà pour le bleu de la liste d'attente (`statusWaitlistOnPlate`).
import { tokens } from "@orasso/design-system/native";

export const plateText = {
  accent: tokens.color.beton.accentText,
  alert: tokens.color.beton.winText,
} as const;
