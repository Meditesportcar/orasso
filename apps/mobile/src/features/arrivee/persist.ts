// Lot R3d (retour réel du 24/10) : l'arrivée survit à la fermeture de l'appli. Android (Samsung surtout) ferme souvent
// l'appli en arrière-plan pendant qu'on va chercher un e-mail ou un mot de passe : le profil, les départements, le
// pseudo, le prénom, le nom, l'e-mail, la case des conditions, `next` et l'étape sont gardés sur l'appareil (stockage
// `kv`). **Jamais le mot de passe.** Le brouillon est effacé à la fin de l'inscription (`finishArrivee`) et à `reset()`.
import { kvDel, kvGetJson, kvSetJson } from "@/lib/kv";

import { type ArriveeDraft, type ArriveeStep, arriveeInitial, arriveeStore, draftOf, mergeDraft } from "./model";

const KEY = "arrivee-draft";
/** Une écriture au plus tous les 300 ms pendant la saisie. */
const SAVE_DELAY = 300;

let persisting = true;
let timer: ReturnType<typeof setTimeout> | null = null;
let resumeStep: ArriveeStep | null = null;

function save() {
  if (timer) clearTimeout(timer);
  timer = null;
  const state = arriveeStore.get();
  // `reset()` remet l'objet de départ : le brouillon s'efface, et la prochaine arrivée sera de nouveau gardée.
  if (state === arriveeInitial) {
    persisting = true;
    void kvDel(KEY);
    return;
  }
  if (!persisting) return;
  timer = setTimeout(() => {
    timer = null;
    if (persisting) void kvSetJson(KEY, draftOf(arriveeStore.get()));
  }, SAVE_DELAY);
}

/** Relu une fois, au premier écran de l'arrivée affiché ; les écritures commencent ensuite (jamais avant la relecture). */
export const arriveeHydrated: Promise<void> = kvGetJson<ArriveeDraft>(KEY).then((stored) => {
  if (stored) {
    arriveeStore.set(mergeDraft(arriveeStore.get(), stored));
    resumeStep = stored.step === "departement" || stored.step === "identite" ? stored.step : null;
  }
  arriveeStore.subscribe(save);
  // Ce qui a été choisi avant la relecture (lien partagé) est gardé aussitôt.
  if (arriveeStore.get() !== arriveeInitial) save();
});

/** L'étape où reprendre après une fermeture de l'appli, donnée une seule fois par lancement. */
export function takeResumeStep(): ArriveeStep | null {
  const step = resumeStep;
  resumeStep = null;
  return step;
}

/** Le compte est créé : le brouillon s'efface et plus rien n'est gardé jusqu'au prochain `reset()`. */
export function finishArrivee(): Promise<void> {
  persisting = false;
  if (timer) clearTimeout(timer);
  timer = null;
  return kvDel(KEY);
}
