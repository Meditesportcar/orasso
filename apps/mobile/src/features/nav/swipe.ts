// Glissement entre onglets (lot 40, prototype `s-plan` : « On glisse à gauche ou à droite pour passer d'un onglet à
// l'autre ») : décisions pures, testées seules. Le geste lui-même est dans `useTabSwipe.ts`.

/** Le geste n'est pris qu'au-delà de 12 px à l'horizontale… */
export const SWIPE_ACTIVE_OFFSET_X = 12;
/** … et tant qu'il n'a pas bougé de plus de 8 px à la verticale (sinon, c'est le défilement de la page). */
export const SWIPE_FAIL_OFFSET_Y = 8;
/** Seuil de bascule : un quart de la largeur de l'écran… */
export const SWIPE_DISTANCE_RATIO = 0.25;
/** … ou un geste vif, 600 px/s. */
export const SWIPE_VELOCITY = 600;

/** Faut-il prendre le geste (horizontal franc, pas un défilement vertical) ? */
export function shouldCaptureSwipe(dx: number, dy: number): boolean {
  return Math.abs(dx) > SWIPE_ACTIVE_OFFSET_X && Math.abs(dy) <= SWIPE_FAIL_OFFSET_Y;
}

/**
 * Où aller au lâcher : +1 = onglet de droite (le doigt part vers la gauche), −1 = onglet de gauche, 0 = rester.
 * `velocityX` en px/s (positif vers la droite), `width` = largeur de l'écran.
 */
export function swipeDirection(dx: number, velocityX: number, width: number): 1 | -1 | 0 {
  const far = width > 0 && Math.abs(dx) >= width * SWIPE_DISTANCE_RATIO;
  const fast = Math.abs(velocityX) >= SWIPE_VELOCITY && Math.sign(velocityX) === Math.sign(dx);
  if (dx === 0 || !(far || fast)) return 0;
  return dx < 0 ? 1 : -1;
}

/**
 * Onglet voisin dans l'ordre de la barre. `tabIds` = identifiants des onglets visibles, `routes` = nom de route →
 * identifiant d'onglet (les pages masquées pointent vers l'onglet qui les range ; les onglets d'abord). Rend le nom de
 * la route à ouvrir, `null` au bord ou pour une route inconnue.
 */
export function neighbourRoute(
  tabIds: readonly string[],
  routes: Record<string, string>,
  current: string | undefined,
  direction: 1 | -1,
): string | null {
  const id = current ? routes[current] : undefined;
  if (!id) return null;
  // Une page masquée (assistant, modifier, inviter, pages d'administration…) ne glisse pas : seuls les onglets le font.
  if (Object.keys(routes).find((name) => routes[name] === id) !== current) return null;
  const next = tabIds[tabIds.indexOf(id) + direction];
  if (!next || tabIds.indexOf(id) < 0) return null;
  return Object.keys(routes).find((name) => routes[name] === next) ?? null;
}
