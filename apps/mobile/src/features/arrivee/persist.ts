// Lot R3d (retour réel du 24/10) : l'arrivée survit à la fermeture de l'appli. Android (Samsung surtout) ferme souvent
// l'appli en arrière-plan pendant qu'on va chercher un e-mail ou un mot de passe : le profil, les départements, le
// pseudo, le prénom, le nom, l'e-mail, la case des conditions, `next` et l'étape sont gardés sur l'appareil (stockage
// `kv`). **Jamais le mot de passe.** Effacé à la fin de l'inscription (`finishArrivee`), à `reset()`, et (tour 2) à
// toute connexion réussie et à la déconnexion (`forgetArrivee`, appelé par la session). File d'écriture : `draftQueue.ts`.
import { kvDel, kvGetJson, kvSetJson } from "@/lib/kv";

import { createDraftPersistence } from "./draftQueue";
import { arriveeStore } from "./model";

const KEY = "arrivee-draft";

const persistence = createDraftPersistence(arriveeStore, {
  get: () => kvGetJson(KEY),
  set: (draft) => kvSetJson(KEY, draft),
  del: () => kvDel(KEY),
});

/** Relu une fois, au premier import (session ou flux d'arrivée). */
export const arriveeHydrated: Promise<void> = persistence.hydrated;
export const takeResumeStep = persistence.takeResumeStep;
export const finishArrivee = persistence.finish;
export const forgetArrivee = persistence.forget;
