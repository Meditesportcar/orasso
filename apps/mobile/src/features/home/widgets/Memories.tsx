// Bloc « Souvenirs » de l'Accueil : emplacement réservé au lot R7j (souvenirs). Tant que `GET /me/home` renvoie
// `memories: null`, il ne rend rien (la carte ne s'affiche que les jours où il y a un souvenir). R7j remplace ce fichier.
import type { HomeMemory } from "@orasso/shared";

export function Memories(_props: { data: HomeMemory | null }) {
  return null;
}
