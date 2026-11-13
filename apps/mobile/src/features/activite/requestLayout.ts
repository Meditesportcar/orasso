// Les deux boutons d'une demande de l'Activité (Accepter / Refuser, « Je confirme le transfert » / « Ce n'est pas le cas ») : côte à côte
// seulement quand la rangée tient, sinon l'un au-dessus de l'autre. Les marges intérieures des boutons sont celles du système de design
// (on ne les réduit pas) : à police agrandie ou avec un long libellé, un libellé qui ne tient pas serait coupé par Android.
// Un mot seul ne passe pas à la ligne : il doit tenir sur la largeur du bouton.

/** Au-dessus de cette échelle de police, « ACCEPTER » ne tient plus à demi-largeur à 384 dp (mesuré à ×1,3). */
export const SIDE_BY_SIDE_MAX_FONT_SCALE = 1.15;
/** Un libellé plus long ne tient pas à demi-largeur même à police normale (« Je confirme le transfert »). */
export const SIDE_BY_SIDE_MAX_LABEL = 12;

/** Les deux boutons partagent-ils la ligne ? */
export function buttonsSideBySide(fontScale: number, labels: readonly string[]): boolean {
  return fontScale <= SIDE_BY_SIDE_MAX_FONT_SCALE && labels.every((l) => l.length <= SIDE_BY_SIDE_MAX_LABEL);
}
