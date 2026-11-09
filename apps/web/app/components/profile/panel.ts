// Lot R7b1, tour 2 : ce que le loader renvoie à la place d'un panneau du Profil (Garage, Sorties) dont la lecture principale
// a échoué. Hors des fichiers `.server` : l'écran en a besoin pour choisir entre le panneau et son message.
export type PanelFailure = { failed: true; status: number };

export function isPanelFailure(value: unknown): value is PanelFailure {
  return typeof value === "object" && value !== null && "failed" in value;
}
