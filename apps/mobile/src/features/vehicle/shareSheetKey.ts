// Clé de la feuille de partage (lot 50, relecture) : tout changement de véhicule ou de version (photo floutée, fiche
// modifiée) remonte la feuille, qui oublie ses aperçus : l'ancien PNG, plaque nette, n'est jamais resservi.
export const shareSheetKey = (vehicleId: string, version: string) => `${vehicleId}:${version}`;
