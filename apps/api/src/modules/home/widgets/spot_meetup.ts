// Bloc « Au spot » de l'Accueil : réservé au lot R7i (rendez-vous au spot). Tant qu'il n'existe pas, le bloc est proposé
// dans « Personnaliser » mais ne montre rien (la carte ne s'affiche que s'il y a un rendez-vous). R7i remplit cette fonction.
import type { HomeSpotMeetup } from "@orasso/shared";

import type { Viewer } from "../../../lib/session";

export async function spotMeetupWidget(_v: Viewer): Promise<HomeSpotMeetup | null> {
  return null;
}
