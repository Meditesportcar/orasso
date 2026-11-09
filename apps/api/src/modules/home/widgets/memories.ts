// Bloc « Souvenirs » de l'Accueil : réservé au lot R7j (souvenirs). Tant qu'il n'existe pas, le bloc est proposé dans
// « Personnaliser » mais ne montre rien (la carte ne s'affiche que les jours où il y a un souvenir). R7j remplit cette fonction.
import type { HomeMemory } from "@orasso/shared";

import type { Viewer } from "../../../lib/session";

export async function memoriesWidget(_v: Viewer): Promise<HomeMemory | null> {
  return null;
}
