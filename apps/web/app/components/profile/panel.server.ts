import { redirect } from "react-router";

import { type ApiResult, loginUrl } from "../../lib/api.server";
import type { PanelFailure } from "./panel";

// Lot R7b1, tour 2 : la lecture d'un panneau du Profil (Garage, Sorties) qui échoue n'emporte que ce panneau : Mon compte
// (réglages, suppression du compte) reste affiché. Une session expirée (401) renvoie toujours à la connexion.

/** La lecture principale d'un panneau : son contenu, ou la panne (le 401 renvoie à la connexion). */
export function mainOrFailure<T>(request: Request, res: ApiResult<T>): { data: T } | PanelFailure {
  if (res.ok) return { data: res.data };
  if (res.status === 401) throw redirect(loginUrl(request));
  return { failed: true, status: res.status };
}
