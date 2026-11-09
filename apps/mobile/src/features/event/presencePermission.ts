// Permission de position de « Je suis sur place » (lot R7d2, tour 2). Fichier sans dépendance native : testable seul.

/** Ce que `Location.requestForegroundPermissionsAsync` renvoie, réduit à ce qui décide (jamais la position). */
export type PermissionAnswer = {
  status: string;
  ios?: { accuracy?: string } | null;
  android?: { accuracy?: string } | null;
};

/**
 * La personne a autorisé la position « approximative » seulement (Android : `coarse` ; iOS : `reduced`). Une position
 * à quelques kilomètres ne prouve rien : on ne la mesure pas, on demande la position exacte.
 */
export function approximateOnly(permission: PermissionAnswer): boolean {
  return permission.android?.accuracy === "coarse" || permission.ios?.accuracy === "reduced";
}
