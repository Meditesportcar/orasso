// « il y a 2 h », « hier », « il y a 3 jours » : l'âge d'une nouveauté de l'Accueil (lot R7a2), commun à l'appli et au site.
// sur l'horloge de l'appareil (ou simulée) ; jamais de date absolue ici, le détail est dans l'écran qu'on ouvre.
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function agoLabel(iso: string, now: Date): string {
  const ms = now.getTime() - new Date(iso).getTime();
  if (!(ms > 0) || ms < MINUTE) return "à l'instant";
  if (ms < HOUR) return `il y a ${Math.floor(ms / MINUTE)} min`;
  if (ms < DAY) return `il y a ${Math.floor(ms / HOUR)} h`;
  if (ms < 2 * DAY) return "hier";
  return `il y a ${Math.floor(ms / DAY)} jours`;
}
