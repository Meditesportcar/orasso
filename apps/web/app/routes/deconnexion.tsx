import { redirect } from "react-router";

import { api, safeReturn, withCookies } from "../lib/api.server";
import type { Route } from "./+types/deconnexion";

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData().catch(() => null);
  const res = await api(request, "/auth/sign-out", { method: "POST", json: {} });
  // `retour` : par exemple la connexion par clé d'accès quand la double authentification est exigée (lot 15).
  return redirect(safeReturn(String(form?.get("retour") ?? ""), "/"), { headers: withCookies(res.headers) });
}

export function loader() {
  return redirect("/");
}
