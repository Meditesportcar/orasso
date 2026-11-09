// Les souvenirs (lot R7j) : textes communs à l'appli et au site, mots de la maquette R7.10.
export const memoryLabels = {
  title: "Souvenirs",
  /** « Il y a un an, jour pour jour » ; « Il y a 2 ans, jour pour jour ». */
  eyebrow: (years: number) => `${memoryAgo(years)}, jour pour jour`,
  /** Page ouverte un autre jour que l'anniversaire : « Il y a un an, le 8 novembre 2025 ». */
  eyebrowOn: (years: number, day: string) => `${memoryAgo(years)}, le ${day}`,
  /** « Tu étais là : Béziers Night » (neutre : exposant ou visiteur, quel que soit l'article du nom). */
  headline: (title: string) => `Tu étais là : ${title}`,
  /** Ligne de la carte du Fil et de la notification. */
  cardTitle: (years: number, title: string) => `${memoryAgo(years)}, tu étais là : ${title}`,
  notificationTitle: "Un souvenir pour toi",
  notificationBody: (years: number, title: string) => `${memoryAgo(years)}, tu étais là : ${title}.`,
  see: "Voir",
  seePlateau: "Le plateau",
  /** « Ta Toyota GR Supra, n° 37 du plateau, au milieu de 118 voitures. » */
  plateauLine: (label: string, rank: number, total: number) =>
    `Ta ${label}, n° ${rank} du plateau${total > 1 ? `, au milieu de ${total} voitures` : ""}.`,
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
