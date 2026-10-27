// Actions de suivi du site (lot R6b, D37 : « Suivre » remplace l'amitié), partagées par le profil, la recherche, « Ton
// réseau », la Boîte et le lien de profil : un seul formulaire POST par action, l'intention est dans le champ `intent`.
// `follow` / `unfollow` (champ `pseudo`) : suivre ou demander ; ne plus suivre ou annuler une demande.
// `follow_accept` / `follow_decline` (champs `userId` et `pseudo`) : répondre à une demande reçue.
import { type FollowState, networkLabels as N } from "@orasso/shared";
import { data } from "react-router";

import { api } from "./api.server";

export const FOLLOW_INTENTS = ["follow", "unfollow", "follow_accept", "follow_decline"] as const;

export function isFollowIntent(intent: string): boolean {
  return (FOLLOW_INTENTS as readonly string[]).includes(intent);
}

export type FollowActionData = {
  followError: string | null;
  /** Après « Accepter » ou le refus : la phrase à afficher. */
  followNotice?: string | null;
  /** Après « Suivre » : mon nouvel état. */
  followMine?: FollowState;
};

/** Exécute l'action de suivi du formulaire ; `{ followError }` (null si tout va bien) ou une erreur lisible. */
export async function followAction(request: Request, form: FormData) {
  const intent = String(form.get("intent") ?? "");
  const pseudo = String(form.get("pseudo") ?? "");
  const userId = encodeURIComponent(String(form.get("userId") ?? ""));
  if (intent === "follow" || intent === "unfollow") {
    const res = await api<{ mine: FollowState }>(request, `/users/${encodeURIComponent(pseudo)}/follow`, {
      method: intent === "follow" ? "POST" : "DELETE",
    });
    if (!res.ok) return data<FollowActionData>({ followError: res.error.message }, { status: res.status });
    return data<FollowActionData>({ followError: null, followMine: res.data.mine });
  }
  if (intent === "follow_accept" || intent === "follow_decline") {
    const accept = intent === "follow_accept";
    const res = await api(request, `/me/follow-requests/${userId}/${accept ? "accept" : "decline"}`, {
      method: "POST",
    });
    if (!res.ok) return data<FollowActionData>({ followError: res.error.message }, { status: res.status });
    return data<FollowActionData>({ followError: null, followNotice: accept ? N.accepted(pseudo) : N.declined });
  }
  return data<FollowActionData>({ followError: "Action inconnue." }, { status: 400 });
}
