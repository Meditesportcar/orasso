// Le profil choisi à l'arrivée doit mener à sa barre (« Ton choix règle tes onglets ») : un Pro, un Organisateur, un
// Prestataire ou un Média crée sa casquette (fiche pro, structure, profil prestataire, profil média) ; un Exposant sans
// véhicule ajoute sa voiture (V5 : la barre suit les véhicules). Tant que ce n'est pas fait, la personne a la barre
// visiteur et une carte « Termine ta fiche » (Accueil, Mon profil). Tout se déduit des données : rien à enregistrer.
import type { MainProfile } from "@orasso/shared";

export type PendingKind = "pro" | "organizer" | "provider" | "media" | "vehicle";

/** L'écran de création existant de chaque casquette (le profil média : lot 55). */
export const pendingPath: Record<PendingKind, string> = {
  pro: "/pro-nouvelle",
  organizer: "/structure/nouvelle",
  provider: "/prestataire/nouveau",
  media: "/media/nouveau",
  vehicle: "/vehicule/nouveau",
};

/** Ce qu'il reste à faire pour avoir la barre du profil choisi, ou `null`. */
export function pendingCasquette(
  mainProfile: MainProfile | null,
  personaKinds: readonly string[],
  vehicles: number,
): PendingKind | null {
  switch (mainProfile) {
    case "exhibitor":
      return vehicles > 0 ? null : "vehicle";
    case "pro":
    case "organizer":
    case "provider":
    case "media":
      return personaKinds.includes(mainProfile) ? null : mainProfile;
    default:
      return null;
  }
}
