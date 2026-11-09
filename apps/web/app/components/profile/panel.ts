// Lot R7b1, tour 2 : ce que le loader renvoie à la place d'un panneau du Profil (Garage, Sorties) dont la lecture principale
// a échoué. Hors des fichiers `.server` : l'écran en a besoin pour choisir entre le panneau et son message.
export type PanelFailure = { failed: true; status: number };

export function isPanelFailure(value: unknown): value is PanelFailure {
  return typeof value === "object" && value !== null && "failed" in value;
}

/** L'adresse de « Réessayer » : celle du Profil avec les paramètres utiles (l'onglet, la saison), jamais les autres. */
export function panelRetryHref(search: URLSearchParams): string {
  const keep = new URLSearchParams();
  for (const key of ["onglet", "saison"]) {
    const value = search.get(key);
    if (value) keep.set(key, value);
  }
  const query = keep.toString();
  return query ? `/app/moi?${query}` : "/app/moi";
}
