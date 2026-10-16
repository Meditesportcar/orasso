// Actions d'amitié du site (lot 17), partagées par le profil, la recherche, « Mes amis » et le lien d'ami : un seul
// formulaire POST par action, l'intention est dans le champ `intent`.
import { data } from "react-router";

import { api } from "./api.server";

export const FRIEND_INTENTS = ["friend_add", "friend_accept", "friend_decline", "friend_remove"] as const;

export function isFriendIntent(intent: string): boolean {
  return (FRIEND_INTENTS as readonly string[]).includes(intent);
}

/** Exécute l'action d'amitié du formulaire ; `{ friend: { ok, message } }` ou une erreur lisible. */
export async function friendAction(request: Request, form: FormData) {
  const intent = String(form.get("intent") ?? "");
  const id = String(form.get("id") ?? "");
  let res: Awaited<ReturnType<typeof api>>;
  if (intent === "friend_add") {
    res = await api(request, "/friends/requests", {
      method: "POST",
      json: { pseudo: String(form.get("pseudo") ?? ""), source: String(form.get("source") ?? "profile") },
    });
  } else if (intent === "friend_accept") {
    res = await api(request, `/friends/requests/${encodeURIComponent(id)}/accept`, { method: "POST" });
  } else if (intent === "friend_decline") {
    res = await api(request, `/friends/requests/${encodeURIComponent(id)}/decline`, { method: "POST" });
  } else if (intent === "friend_remove") {
    res = await api(request, `/friends/${encodeURIComponent(String(form.get("userId") ?? ""))}`, { method: "DELETE" });
  } else {
    return data({ friendError: "Action inconnue." }, { status: 400 });
  }
  if (!res.ok) return data({ friendError: res.error.message }, { status: res.status });
  return data({ friendError: null as string | null });
}
