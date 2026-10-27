import { expect, type Page } from "@playwright/test";
import { apiCall } from "./helpers";
import type { R5Account, R5Crew } from "./lotr5c2-setup";

// Lot R6a (la page du crew en direct) : ce que « Julie » fait pendant que la page de « Kenji » est ouverte, par l'API
// comme le ferait son appli. Les deux rôles sont tenus par les comptes neufs d'un crew de recette (`r5Crew` : le chef =
// Kenji, la membre = Julie) : la recette retire Julie du crew, ce qui ne doit pas toucher le crew du seed.

export async function postText(crew: R5Crew, by: R5Account, text: string): Promise<string> {
  const res = await apiCall<{ id: string }>(by.cookie, "POST", `/crews/${crew.id}/posts`, { kind: "text", text });
  expect(res.status).toBe(201);
  return res.data.id;
}

export async function fire(crew: R5Crew, by: R5Account, postId: string) {
  expect((await apiCall(by.cookie, "PUT", `/crews/${crew.id}/posts/${postId}/reaction`)).status).toBe(200);
}

export async function comment(crew: R5Crew, by: R5Account, postId: string, text: string) {
  expect((await apiCall(by.cookie, "POST", `/crews/${crew.id}/posts/${postId}/comments`, { text })).status).toBe(201);
}

export async function removePost(crew: R5Crew, by: R5Account, postId: string) {
  expect((await apiCall(by.cookie, "DELETE", `/crews/${crew.id}/posts/${postId}`)).status).toBe(204);
}

/** Nina (demande déjà envoyée par `r5Crew`) est acceptée par le chef. */
export async function acceptNina(crew: R5Crew) {
  expect((await apiCall(crew.chef.cookie, "POST", `/crews/${crew.id}/requests/${crew.nina.id}/accept`)).status).toBe(
    204,
  );
}

export async function removeMember(crew: R5Crew, who: R5Account) {
  expect((await apiCall(crew.chef.cookie, "DELETE", `/crews/${crew.id}/members/${who.id}`)).status).toBe(204);
}

/** Tour 2 : Julie modifie le lieu de sa sortie. */
export async function moveOuting(crew: R5Crew, by: R5Account, outingId: string, place: string) {
  expect((await apiCall(by.cookie, "PATCH", `/crews/${crew.id}/outings/${outingId}`, { place })).status).toBe(200);
}

/** Tour 2 : Julie annule sa sortie. */
export async function cancelOuting(crew: R5Crew, by: R5Account, outingId: string) {
  expect((await apiCall(by.cookie, "DELETE", `/crews/${crew.id}/outings/${outingId}`)).status).toBe(204);
}

/**
 * Tour 2 : à poser par `addInitScript` avant d'ouvrir la page. Garde les WebSocket de la page, pour couper la connexion
 * comme une coupure de réseau (`cutSockets`) : le client se reconnecte seul et relit tout.
 */
export function trackSockets() {
  const Native = window.WebSocket;
  const list: WebSocket[] = [];
  (window as unknown as { __orassoSockets: WebSocket[] }).__orassoSockets = list;
  class Tracked extends Native {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      list.push(this);
    }
  }
  window.WebSocket = Tracked;
}

/** Coupe les connexions temps réel d'Orasso (`/api/ws`) ; pas celle du serveur de développement (rechargement). */
export async function cutSockets(page: Page) {
  await page.evaluate(() => {
    for (const s of (window as unknown as { __orassoSockets?: WebSocket[] }).__orassoSockets ?? []) {
      if (s.url.includes("/api/ws")) s.close();
    }
  });
}
