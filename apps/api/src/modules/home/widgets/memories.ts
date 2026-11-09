// Bloc « Souvenirs » de l'Accueil (lot R7j, maquette R7.10) : les souvenirs d'aujourd'hui, « il y a un an, jour pour jour ».
// Les jours où il n'y en a pas, `null` : le bloc ne s'affiche pas (et ce widget masqué n'est pas calculé, règle de l'Accueil).
// Ne sert que la personne qui regarde : la lecture part de son identifiant.
import type { HomeMemory } from "@orasso/shared";

import type { Viewer } from "../../../lib/session";
import { memoriesService } from "../../memories/service";

export async function memoriesWidget(v: Viewer): Promise<HomeMemory | null> {
  const items = await memoriesService.todayFor(v.user.id);
  return items.length ? { items } : null;
}
