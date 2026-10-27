// Lot R6b, tour 2 (relecture Codex 4) : un compte privé qui a reçu plus d'une page de demandes d'abonnement (30 par
// page) ; pseudos uniques, aucune date figée.
import { apiCall, type Cookie, signUpApi, unique } from "../helpers";

export type ManyRequests = { pseudo: string; email: string; cookie: Cookie; askers: string[] };

/** Un compte privé et `n` personnes qui lui demandent de le suivre (la plus ancienne en premier dans `askers`). */
export async function privateWithRequests(prefix: string, n: number): Promise<ManyRequests> {
  const pseudo = `${prefix}${unique()}`.slice(0, 20);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo, email);
  const res = await apiCall(cookie, "PATCH", "/me/profile", { departments: ["66"], visibility: "private" });
  if (res.status !== 200) throw new Error(`Compte privé : ${res.status}`);
  const askers: string[] = [];
  for (let i = 0; i < n; i++) {
    const asker = `R6bQ${i}${unique()}`.slice(0, 20);
    const c = await signUpApi(asker);
    const asked = await apiCall<{ mine: string }>(c, "POST", `/users/${pseudo}/follow`);
    if (asked.status !== 200 || asked.data.mine !== "pending") throw new Error(`Demande ${asker} : ${asked.status}`);
    askers.push(asker);
  }
  return { pseudo, email, cookie, askers };
}
