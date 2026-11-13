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
 * Lot R7a1 (D38) : la barre du passionné (exposant et visiteur) est Explorer · Le Fil · Accueil · Crew · Profil.
 */
const exhibitorTabs = [
  { id: "explore", label: "Explorer", icon: "explore" },
  { id: "feed", label: "Le Fil", icon: "feed" },
  { id: "home", label: "Accueil", icon: "o", center: true, o: true },
  { id: "crew", label: "Crew", icon: "crew" },
  { id: "profile", label: "Profil", icon: "profile" },
] as const;

export const tabSets = {
  exhibitor: exhibitorTabs,
  // Lot R7a1 (D38) : la même barre pour l'exposant et le visiteur (Sorties passe dans l'Accueil, le Garage et le
  // Passeport dans le Profil, la place libérée devient Crew).
  visitor: exhibitorTabs,
  // Lot R9n (maquette R9.1) : « Le Fil » et « Page » dans chaque groupe ; le compte personnel est dans « Mes casquettes ».
  pro: [
    { id: "scanner", label: "Scanner", icon: "qr" },
    { id: "feed", label: "Le Fil", icon: "feed" },
    { id: "home", label: "Accueil", icon: "o", center: true, o: true },
    { id: "stats", label: "Stats", icon: "live" },
    { id: "page", label: "Page", icon: "cards" },
  ],
  provider: [
    { id: "missions", label: "Missions", icon: "briefcase" },
    { id: "feed", label: "Le Fil", icon: "feed" },
    { id: "home", label: "Accueil", icon: "o", center: true, o: true },
    { id: "applications", label: "Candidatures", icon: "list" },
    { id: "page", label: "Page", icon: "cards" },
  ],
  media: [
    { id: "explore", label: "Explorer", icon: "explore" },
    { id: "feed", label: "Le Fil", icon: "feed" },
    { id: "home", label: "Accueil", icon: "o", center: true, o: true },
    { id: "press", label: "Presse", icon: "press" },
    { id: "page", label: "Page", icon: "cards" },
  ],
  organizer: [
    { id: "events", label: "Événements", icon: "calendar" },
    { id: "sort", label: "Tri", icon: "check" },
    { id: "live", label: "Direct", icon: "live", center: true, o: true },
    { id: "feed", label: "Le Fil", icon: "feed" },
    { id: "page", label: "Page", icon: "cards" },
  ],
  /**
   * L'ancien passionné = l'exposant.
   * @deprecated Utiliser `exhibitor` (alias conservé jusqu'au lot 58).
   */
  fan: exhibitorTabs,
} as const;
export type TabSetName = keyof typeof tabSets;
