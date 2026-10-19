import { DEPT_COOKIE } from "@orasso/design-system/web";
import { redirect } from "react-router";

import { api, safeReturn, withCookies } from "../lib/api.server";
import type { Route } from "./+types/deconnexion";

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData().catch(() => null);
  const res = await api(request, "/auth/sign-out", { method: "POST", json: {} });
  // `retour` : par exemple la connexion par clé d'accès quand la double authentification est exigée (lot 15).
  const headers = withCookies(res.headers);
  // Lot 38 : le département du thème Automatique appartient au compte ; on l'oublie à la déconnexion.
  headers.append("set-cookie", `${DEPT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`);
  return redirect(safeReturn(String(form?.get("retour") ?? ""), "/"), { headers });
}

export function loader() {
  return redirect("/");
}
