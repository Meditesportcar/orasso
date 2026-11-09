import { expect } from "@playwright/test";
import { apiCall, signUpApi, unique } from "./helpers";

// Lot R7a1, tour 2 : un compte neuf (visiteur : sans véhicule) qui reçoit d'abord une demande de contact seule, puis une
// conversation non lue, pour lire les pastilles de la barre du haut (cloche = notifications et demandes, bulle =
// conversations non lues). Partagé par les recettes du site et de l'appli.
export type PastilleCompte = {
  pseudo: string;
  email: string;
  cookie: string;
  summary: () => Promise<{ unreadMessages: number; requests: Record<string, number> }>;
  /** Une notification non lue de plus (une demande de contact d'une nouvelle personne ; un abonnement se regroupe). */
  ajouterNotificationNonLue: () => Promise<void>;
  /** Une conversation avec un message non lu (la personne qui écrit est suivie par le compte). */
  ajouterConversationNonLue: () => Promise<void>;
};

export async function creerComptePastilles(): Promise<PastilleCompte> {
  const s = unique();
  const pseudo = `Alma_${s}`;
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo);
  const sender = `Basile_${s}`;
  const senderCookie = await signUpApi(sender);
  // Une demande de contact seule (B ne se suit pas avec A : c'est une demande, pas une conversation).
  const asked = await apiCall(senderCookie, "POST", "/contact-requests", {
    pseudo,
    message: "Bonjour, ta voiture est-elle à vendre ?",
  });
  expect(asked.status).toBeLessThan(300);
  const summary = async () =>
    (await apiCall<{ unreadMessages: number; requests: Record<string, number> }>(cookie, "GET", "/me/inbox/summary"))
      .data;
  return {
    pseudo,
    email,
    cookie,
    summary,
    async ajouterNotificationNonLue() {
      const asker = await signUpApi(`Dora_${unique()}`);
      const res = await apiCall(asker, "POST", "/contact-requests", { pseudo, message: "Salut" });
      expect(res.status).toBeLessThan(300);
    },
    async ajouterConversationNonLue() {
      const other = `Cyril_${s}`;
      const otherCookie = await signUpApi(other);
      const [meId, otherId] = [
        (await apiCall<{ user: { id: string } }>(cookie, "GET", "/me")).data.user.id,
        (await apiCall<{ user: { id: string } }>(otherCookie, "GET", "/me")).data.user.id,
      ];
      // « Chacun écrit directement à qui le suit » : le compte suit Cyril (un compte privé demande d'abord).
      const followed = await apiCall<{ mine: string }>(cookie, "POST", `/users/${other}/follow`);
      expect(followed.status).toBeLessThan(300);
      if (followed.data.mine === "pending") {
        expect((await apiCall(otherCookie, "POST", `/me/follow-requests/${meId}/accept`)).status).toBeLessThan(300);
      }
      const convo = await apiCall<{ id?: string; conversation?: { id: string } }>(
        otherCookie,
        "POST",
        "/conversations/direct",
        { userId: meId },
      );
      expect(convo.status).toBeLessThan(300);
      const id = convo.data.id ?? convo.data.conversation?.id;
      expect(id, JSON.stringify({ otherId, data: convo.data })).toBeTruthy();
      const sent = await apiCall(otherCookie, "POST", `/conversations/${id}/messages`, {
        clientId: crypto.randomUUID(),
        body: "Salut, tu viens samedi ?",
      });
      expect(sent.status).toBeLessThan(300);
    },
  };
}
