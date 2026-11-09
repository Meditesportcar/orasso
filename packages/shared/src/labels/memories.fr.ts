// Les souvenirs (lot R7j) : textes communs à l'appli et au site, mots de la maquette R7.10.
export const memoryLabels = {
  title: "Souvenirs",
  /** « Il y a un an, jour pour jour » ; « Il y a 2 ans, jour pour jour ». */
  eyebrow: (years: number) => `${memoryAgo(years)}, jour pour jour`,
  /** « Tu étais à Béziers Night ». */
  headline: (title: string) => `Tu étais à ${title}`,
  /** Ligne de la carte du Fil et de la notification. */
  cardTitle: (years: number, title: string) => `${memoryAgo(years)}, tu étais à ${title}`,
  notificationTitle: "Un souvenir pour toi",
  notificationBody: (years: number, title: string) => `${memoryAgo(years)}, tu étais à ${title}.`,
  see: "Voir",
  seeRecap: "Voir le récap",
  seeEvent: "La fiche de l'événement",
  yourStamp: "Ton tampon",
  /** « Posé le samedi 8 novembre 2025 ». */
  stampedOn: (day: string) => `Posé le ${day}`,
  yourCar: (label: string) => `Avec ${label}`,
  pageTitle: "Souvenir",
  dateLine: (date: string, city: string | null) => (city ? `${date} · ${city}` : date),
  unavailable: "Ce souvenir n'est pas disponible.",
  loadError: "Impossible de charger ce souvenir.",
  retry: "Réessayer",
  /** Raison sous la carte du Fil. */
  reason: "Un souvenir pour toi",
} as const;

/** « Il y a un an » (1), « Il y a 2 ans » (2 et plus). */
export function memoryAgo(years: number): string {
  return years === 1 ? "Il y a un an" : `Il y a ${years} ans`;
}
