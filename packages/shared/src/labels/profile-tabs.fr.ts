// Le Profil avec le Garage (lot R7b1, décision D38, maquette R7.12) : les deux onglets internes (Garage · Sorties), l'anneau
// des stories, le profil d'un autre. Appli et site disent les mêmes mots.

export const profileTabsLabels = {
  /** Nom accessible de la rangée d'onglets. */
  group: "Contenu du profil",
  garage: "Garage",
  outings: "Sorties",
  /** Le bouton secondaire de l'onglet Sorties : mes places (candidatures, billets) sont dans la page Sorties. */
  seePlaces: "Voir mes places",
  /** Toucher l'anneau d'avatar ouvre ses stories. */
  openStories: (pseudo: string) => `Voir les stories de ${pseudo}`,
  /** Accès à l'aperçu de mon profil, comme le voient les autres. */
  publicProfile: "Profil public",
  publicProfileHint: "Comme te voient les autres",
  /** Compte privé vu par quelqu'un qui n'est pas abonné accepté : les nombres, le reste est réservé. */
  privateTitle: "Réservé à ses abonnés",
  privateBody: "Ses véhicules, ses sorties et son crew sont visibles de ses abonnés.",
  privateBodyWaiting: "Ta demande attend sa réponse. Ses véhicules et ses sorties s'ouvriront si elle est acceptée.",
  /** Onglet vide d'un autre profil. */
  noVehicle: "Pas encore de véhicule.",
  noOuting: "Aucune sortie à montrer pour l'instant.",
  message: "Message",
  /** Mon profil, l'onglet interne s'ouvre par `?onglet=garage|sorties` (Garage par défaut partout). */
  param: "onglet",
} as const;

export type ProfileTab = "garage" | "sorties";
export const profileTabs: readonly ProfileTab[] = ["garage", "sorties"];

/** L'onglet demandé par l'adresse (`?onglet=`) ; tout ce qui n'est pas « sorties » ouvre le Garage (défaut retenu partout). */
export function profileTabFromParam(value: string | null | undefined): ProfileTab {
  return value === "sorties" ? "sorties" : "garage";
}
