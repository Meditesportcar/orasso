// Étape vue jusqu'en bas (lot R3a, retour 3 de Damien du 24/10) : dans un parcours, « Continuer » reste bloqué tant que
// le bas d'une étape plus haute que l'écran n'a pas été vu. Pur : testé sans React Native.

/** Le bas compte comme vu à cette distance près (px) : « en bas, ou presque ». */
export const END_MARGIN = 48;

/**
 * Le bas du contenu est-il visible ? `offset` : défilement ; `viewport` : hauteur de la zone qui défile ; `content` :
 * hauteur du contenu. Une mesure manquante (0) : pas encore (on attend la mise en page). Un contenu qui tient dans la
 * zone est vu d'emblée.
 */
export function endReached(m: { offset: number; viewport: number; content: number }, margin = END_MARGIN): boolean {
  if (!(m.viewport > 0) || !(m.content > 0)) return false;
  return m.offset + m.viewport >= m.content - margin;
}

/**
 * Étapes déjà vues : une fois vue, une étape reste débloquée (on peut remonter, revenir en arrière, repartir). Rend le
 * même ensemble si rien ne change (pas de rendu de plus).
 */
export function markSeen(seen: ReadonlySet<number>, step: number): ReadonlySet<number> {
  if (seen.has(step)) return seen;
  const next = new Set(seen);
  next.add(step);
  return next;
}

/** « Continuer » attend-il que l'étape soit vue ? Jamais avec un lecteur d'écran (il lit tout, sans défiler). */
export const waitsForEnd = (seen: ReadonlySet<number>, step: number, screenReader: boolean): boolean =>
  !screenReader && !seen.has(step);
