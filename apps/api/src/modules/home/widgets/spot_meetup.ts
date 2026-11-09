// Bloc « Au spot » de l'Accueil (lot R7i, maquette R7.9) : le prochain rendez-vous reçu (d'un abonnement accepté ou d'un crew
// dont je suis membre actif), sinon le mien ; rien d'autre (le bloc ne s'affiche que s'il y en a un). Même règles de
// visibilité que `GET /me/spot-meetups/incoming` : le lieu n'est servi qu'à l'auteur et aux invités. Un bloc masqué n'est pas
// calculé (`want("spot_meetup")` dans le service de l'Accueil).
import type { HomeSpotMeetup } from "@orasso/shared";

import type { Viewer } from "../../../lib/session";
import { spotMeetupsService } from "../../spot-meetups/service";

export async function spotMeetupWidget(v: Viewer): Promise<HomeSpotMeetup | null> {
  try {
    return await spotMeetupsService.homeBlock(v);
  } catch (error) {
    // Un bloc qui échoue ne casse pas l'Accueil : il n'est simplement pas montré.
    console.error("Accueil : bloc « Au spot » :", error);
    return null;
  }
}
