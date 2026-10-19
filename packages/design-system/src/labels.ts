// Libellés du système de design, communs au site et à l'appli : exactement ceux des docs (README des composants).

/** Les sept états du composant StatusBadge (candidature et événement). */
export const badgeStatuses = [
  "pending",
  "retained",
  "waitlist",
  "refused",
  "onsite",
  "cancelled",
  "uncertain",
] as const;
export type BadgeStatus = (typeof badgeStatuses)[number];

export const badgeLabels: Record<BadgeStatus, string> = {
  pending: "En attente",
  retained: "Retenue",
  waitlist: "Liste d'attente",
  refused: "Refusée",
  onsite: "Sur place",
  cancelled: "Annulé",
  uncertain: "Incertain",
};

/** Rang de la liste d'attente : « 4e » (« 1er » pour le premier). */
export function rankLabel(rank: number): string {
  return rank === 1 ? "1er" : `${rank}e`;
}

/** Les trois résultats d'un scan (ScanResult). */
export const scanResults = ["ok", "duplicate", "refused"] as const;
export type ScanResultState = (typeof scanResults)[number];

export const scanLabels: Record<ScanResultState, string> = {
  ok: "OK",
  duplicate: "Déjà entré",
  refused: "Refusé",
};

/**
 * Les six profils et leur barre d'onglets (DA v2, lot 38, ARCHITECTURE-DA-V2 § 2.1 ; prototype proto-v2-ecrans.md) :
 * cinq onglets, celui du milieu porte le O (`o`) : Accueil pour cinq profils, Direct pour l'organisateur.
 */
const exhibitorTabs = [
  { id: "explore", label: "Explorer", icon: "explore" },
  { id: "outings", label: "Sorties", icon: "ticket" },
  { id: "home", label: "Accueil", icon: "o", center: true, o: true },
  { id: "garage", label: "Garage", icon: "vehicle" },
  { id: "profile", label: "Profil", icon: "profile" },
] as const;

export const tabSets = {
  exhibitor: exhibitorTabs,
  visitor: [
    { id: "explore", label: "Explorer", icon: "explore" },
    { id: "outings", label: "Sorties", icon: "ticket" },
    { id: "home", label: "Accueil", icon: "o", center: true, o: true },
    { id: "passport", label: "Passeport", icon: "stamp" },
    { id: "profile", label: "Profil", icon: "profile" },
  ],
  pro: [
    { id: "scanner", label: "Scanner", icon: "qr" },
    { id: "card", label: "Ma fiche", icon: "plate" },
    { id: "home", label: "Accueil", icon: "o", center: true, o: true },
    { id: "stats", label: "Stats", icon: "live" },
    { id: "profile", label: "Profil", icon: "profile" },
  ],
  provider: [
    { id: "missions", label: "Missions", icon: "briefcase" },
    { id: "applications", label: "Candidatures", icon: "list" },
    { id: "home", label: "Accueil", icon: "o", center: true, o: true },
    { id: "showcase", label: "Vitrine", icon: "shop" },
    { id: "profile", label: "Profil", icon: "profile" },
  ],
  media: [
    { id: "explore", label: "Explorer", icon: "explore" },
    { id: "press", label: "Presse", icon: "press" },
    { id: "home", label: "Accueil", icon: "o", center: true, o: true },
    { id: "contents", label: "Contenus", icon: "gallery" },
    { id: "profile", label: "Profil", icon: "profile" },
  ],
  organizer: [
    { id: "events", label: "Événements", icon: "calendar" },
    { id: "sort", label: "Tri", icon: "check" },
    { id: "live", label: "Direct", icon: "live", center: true, o: true },
    { id: "team", label: "Équipe", icon: "staff" },
    { id: "structure", label: "Structure", icon: "badge" },
  ],
  /**
   * L'ancien passionné = l'exposant.
   * @deprecated Utiliser `exhibitor` (alias conservé jusqu'au lot 58).
   */
  fan: exhibitorTabs,
} as const;
export type TabSetName = keyof typeof tabSets;

/**
 * Barres v1 des quatre casquettes (lot 16) : encore branchées dans l'appli et sur le site jusqu'au lot 40, qui passe aux
 * six barres v2 (`tabSets`).
 * @deprecated Remplacées par `tabSets` (DA v2, lot 38) ; retirées au lot 58.
 */
export const legacyTabSets = {
  fan: [
    { id: "home", label: "Accueil", icon: "home" },
    { id: "explore", label: "Explorer", icon: "explore" },
    { id: "access", label: "Accès", icon: "qr", center: true },
    { id: "garage", label: "Garage", icon: "vehicle" },
    { id: "inbox", label: "Boîte", icon: "inbox" },
  ],
  organizer: [
    { id: "live", label: "Direct", icon: "live" },
    { id: "events", label: "Événements", icon: "calendar" },
    { id: "sort", label: "Tri", icon: "check", center: true },
    { id: "inbox", label: "Boîte", icon: "inbox" },
    { id: "staff", label: "Staff", icon: "staff" },
  ],
  pro: [
    { id: "card", label: "Fiche", icon: "plate" },
    { id: "publish", label: "Publier", icon: "chat" },
    { id: "scanner", label: "Scanner", icon: "qr", center: true },
    { id: "stats", label: "Stats", icon: "live" },
    { id: "inbox", label: "Boîte", icon: "inbox" },
  ],
  // Casquette Prestataire (lot 16, ARCHITECTURE-SUITE § 7.1) : trois onglets, aucun au centre (pas d'action
  // principale qui mérite la pastille inclinée).
  provider: [
    { id: "applications", label: "Candidatures", icon: "list" },
    { id: "profile", label: "Profil", icon: "profile" },
    { id: "inbox", label: "Boîte", icon: "inbox" },
  ],
} as const;
export type LegacyTabSetName = keyof typeof legacyTabSets;
