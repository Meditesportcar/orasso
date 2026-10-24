// Règles de la liste de l'Explorer (lot R1, retours de Damien du 24/10), communes à l'API, au site et à l'appli.

/**
 * Un événement terminé (sa fin est passée ; plusieurs jours : la fin du dernier jour, que porte `endsAt`) ne se montre
 * plus dans l'Explorer : ni dans la liste, ni sur la carte. Il reste dans « passés » (`scope=past`) et sur sa fiche.
 */
export function isEventOver(event: { endsAt: string | Date }, now: Date): boolean {
  const end = event.endsAt instanceof Date ? event.endsAt.getTime() : Date.parse(event.endsAt);
  return Number.isFinite(end) && end < now.getTime();
}

/** Les événements pas encore terminés, dans le même ordre (une liste lue du cache peut dater d'hier). */
export function notOver<T extends { endsAt: string | Date }>(items: readonly T[], now: Date): T[] {
  return items.filter((e) => !isEventOver(e, now));
}

/**
 * Borne basse de la fin des événements « à venir » : le début de la période demandée, jamais avant maintenant. Le
 * filtre « Ce week-end » commence le samedi à 0 h : le dimanche, il ne remonte pas les événements finis la veille.
 */
export function upcomingEndBound(from: Date | undefined, now: Date): Date {
  return from && from.getTime() > now.getTime() ? from : now;
}
