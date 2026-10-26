// Le profil du compte (`/api/me`) gardé sur l'appareil pour l'affichage hors ligne. Lu par la session quand l'API ne
// répond pas ; réécrit à chaque profil frais (lecture de `/me`, ou réponse d'un enregistrement : lot R5b, tour 2).
import type { Me } from "@orasso/shared";

import { kvDel, kvGetJson, kvSetJson } from "./kv";

const ME_KEY = "me";

export const rememberMe = (me: Me) => kvSetJson(ME_KEY, me);
export const cachedMe = () => kvGetJson<Me>(ME_KEY);
export const forgetMe = () => kvDel(ME_KEY);
