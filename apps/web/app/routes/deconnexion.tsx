import { DEPT_COOKIE } from "@orasso/design-system/web";
import { redirect } from "react-router";
import { purgePublished } from "../components/fil/mine";
import { api, safeReturn, withCookies } from "../lib/api.server";
import { clearExplorerCookie } from "../lib/explorerChoice.server";
import { announceSession } from "../lib/sessionChannel";
import type { Route } from "./+types/deconnexion";

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData().catch(() => null);
  const res = await api(request, "/auth/sign-out", { method: "POST", json: {} });
  // `retour` : par exemple la connexion par clé d'accès quand la double authentification est exigée (lot 15).
  const headers = withCookies(res.headers);
  // Lot 38 : le département du thème Automatique appartient au compte ; on l'oublie à la déconnexion.
  headers.append("set-cookie", `${DEPT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`);
  // Lot R1 : le choix de l'Explorer appartient aussi au compte.
  headers.append("set-cookie", clearExplorerCookie(request));
  return redirect(safeReturn(String(form?.get("retour") ?? ""), "/"), { headers });
}

export function loader() {
  return redirect("/");
}

// Lot R7e2, tour 4 : « Ma publication » gardée dans l'onglet (Fil) appartient au compte qui se déconnecte : elle part avec lui,
// avant même la réponse du serveur (le compte suivant, dans le même onglet, ne doit rien en voir).
export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  purgePublished();
  let result: Awaited<ReturnType<typeof serverAction>>;
  try {
    result = await serverAction();
  } catch (thrown) {
    // L'action répond par une redirection (`redirect(...)`) : `serverAction()` la lève ; la session est révoquée, on annonce.
    if (thrown instanceof Response && thrown.status >= 300 && thrown.status < 400) announceSession(null);
    throw thrown;
  }
  // Tour 6 : les autres fenêtres ne l'apprennent qu'APRÈS la révocation de la session (annoncé avant, une visionneuse pouvait
  // relire `/me`, encore valide, et réafficher les données du compte). Elle se masque, relit le compte (401 → rechargement).
  announceSession(null);
  return result;
}
