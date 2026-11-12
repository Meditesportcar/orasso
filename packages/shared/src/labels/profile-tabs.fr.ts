// Le Profil avec le Garage (lot R7b1, décision D38, maquette R7.12) : les deux onglets internes (Garage · Sorties), l'anneau
// des stories, le profil d'un autre. Appli et site disent les mêmes mots.

export const profileTabsLabels = {
  /** Nom accessible de la rangée d'onglets. */
  group: "Contenu du profil",
  garage: "Garage",
  outings: "Sorties",
  /** Lot R8b2 (maquette R8.1) : le troisième onglet, ouvert par défaut. */
  publications: "Publications",
  /** Le bouton secondaire de l'onglet Sorties : mes places (candidatures, billets) sont dans la page Sorties. */
  seePlaces: "Voir mes places",
  /** Tour 2 : une panne du garage ou du passeport n'emporte que son panneau (le reste du compte reste là). */
  garageDown: "Ton garage ne se charge pas pour le moment.",
  outingsDown: "Ton passeport ne se charge pas pour le moment.",
  retry: "Réessayer",
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
  // Lot R8b1 (maquette R8.1 `pr-profil`, option A « Compact ») : le haut du Profil.
  /** La bio sur une ligne : « plus » la déroule, « moins » la replie. */
  bioMore: "plus",
  bioLess: "moins",
  /** Noms accessibles des icônes empilées à droite de la photo (mon profil : mon QR et les réglages). */
  qrOpen: "Mon QR",
  settingsOpen: "Réglages",
  /** Profil d'un autre : l'icône « Plus » (signaler) et le titre de sa feuille. */
  more: "Plus",
  moreTitle: "Plus d'actions",
  /** La ligne de la feuille « Plus » d'un profil : le signalement qui existait déjà dans l'en-tête de l'écran. */
  reportProfile: "Signaler ce profil",
  /** Première ligne de Réglages : l'aperçu de mon profil, comme les autres le voient. */
  seeAsOthers: "Voir mon profil comme les autres",
  /** Titre de la feuille des partenaires quand leur lecture a échoué et qu'aucune copie n'existe. */
  partnersTitle: "Partenaires",
  /** Valeur d'un compteur dont la lecture a échoué : jamais « 0 » ni « aucun » à la place d'une panne. */
  unknownCount: "–",
  /** L'onglet Garage vide : l'état vide et son bouton principal (le seul de l'onglet). */
  garageEmptyTitle: "Ton garage est vide",
  /** Lot R8r : l'onglet Garage d'un visiteur dont les véhicules ne sont pas encore lus (pas de roue qui tourne). */
  garageLoading: "Chargement du garage…",
  garageEmptyText: "Ajoute ta première voiture : marque, photos, plaque floutée.",
  /** Mon profil, l'onglet interne s'ouvre par `?onglet=garage|sorties` (Garage par défaut partout). */
  param: "onglet",
} as const;

export type ProfileTab = "garage" | "sorties" | "publications";
export const profileTabs: readonly ProfileTab[] = ["garage", "sorties", "publications"];

/** L'onglet demandé par l'adresse (`?onglet=`) : « sorties » ou « publications » ; tout le reste ouvre le Garage. */
export function profileTabFromParam(value: string | null | undefined): ProfileTab {
  return value === "sorties" || value === "publications" ? value : "garage";
}

/**
 * Lot R8b2 : l'adresse a-t-elle demandé un onglet (`?onglet=`) ? Sans demande, c'est `profileOpenTab` (`rules/publicationsList`)
 * qui choisit l'onglet d'ouverture.
 */
export function explicitProfileTab(value: string | null | undefined): ProfileTab | null {
  return value === "garage" || value === "sorties" || value === "publications" ? value : null;
}

/**
 * Lot R8b1 (décision D40) : un profil sans véhicule n'a pas d'onglet « Garage » et s'ouvre sur « Sorties » ; un garage vide
 * d'un exposant garde l'onglet (« Garage · 0 »). « Publications » existe pour tous les profils.
 */
export function visibleProfileTab(tab: ProfileTab, hasGarage: boolean): ProfileTab {
  if (tab === "publications") return tab;
  return hasGarage ? tab : "sorties";
}
