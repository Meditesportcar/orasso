import { redirect } from "react-router";

import { api, withCookies } from "../lib/api.server";
import type { Route } from "./+types/deconnexion";

export async function action({ request }: Route.ActionArgs) {
  const res = await api(request, "/auth/sign-out", { method: "POST", json: {} });
  return redirect("/", { headers: withCookies(res.headers) });
}

export function loader() {
  return redirect("/");
}
