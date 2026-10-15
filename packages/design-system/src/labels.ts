// Libellés du système de design, communs au site et à l'appli : exactement ceux des docs (README des composants).

/** Les sept états du composant StatusBadge (candidature et événement). */
export const badgeStatuses = ["pending", "retained", "waitlist", "refused", "onsite", "cancelled", "uncertain"] as const;
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

/** Les trois casquettes qui ont une barre d'onglets (TabBar). */
export const tabSets = {
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
} as const;
export type TabSetName = keyof typeof tabSets;
