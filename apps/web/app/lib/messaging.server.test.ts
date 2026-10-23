// « Écrire à » depuis la fiche du site (lot M4, tour 2) : une réponse perdue renvoie le même identifiant et le même
// texte, l'API ne publie pas de doublon.
import { afterEach, describe, expect, it, vi } from "vitest";

import { messageAction } from "./messaging.server";

const CLIENT_ID = "3f1d2c4b-5a6e-4f70-8a9b-0c1d2e3f4a5b";

/** Une API qui dédoublonne par `clientId` ; `lose` : la réponse au message enregistré se perd (le site ne reçoit rien). */
function fakeApi(lose: boolean) {
  const saved = new Map<string, string>();
  let losing = lose;
  const posted: string[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/conversation")) return Response.json({ id: "conv-1" });
    const json = JSON.parse(String(init?.body ?? "{}")) as { clientId: string; body: string };
    posted.push(json.clientId);
    if (!saved.has(json.clientId)) saved.set(json.clientId, json.body);
    if (losing) {
      losing = false;
      throw new TypeError("fetch failed");
    }
    return Response.json({ message: { id: "m1" }, created: true }, { status: 201 });
  });
  return { saved, posted, fetchMock };
}

const formOf = (fields: Record<string, string>) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
};

const request = () => new Request("http://site.test/e/nocturne", { method: "POST", headers: { cookie: "s=1" } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("contact_organizer avec un message", () => {
  it("réponse perdue : l'action rend le même identifiant et le même texte ; le nouvel essai ne double pas", async () => {
    const api = fakeApi(true);
    vi.stubGlobal("fetch", api.fetchMock);
    const fields = {
      intent: "contact_organizer",
      structureId: "s-1",
      aboutEventId: "e-1",
      body: "Je peux venir avec une remorque ?",
      clientId: CLIENT_ID,
    };
    const first = (await messageAction(request(), formOf(fields))) as unknown as {
      data: { pending: { clientId: string; body: string } | null };
    };
    expect(first.data.pending).toEqual({ clientId: CLIENT_ID, body: "Je peux venir avec une remorque ?" });
    // Le formulaire renvoie ce brouillon : même identifiant, même texte.
    await expect(
      messageAction(request(), formOf({ ...fields, clientId: first.data.pending?.clientId ?? "" })),
    ).rejects.toBeInstanceOf(Response);
    expect(api.posted).toEqual([CLIENT_ID, CLIENT_ID]);
    expect([...api.saved.values()]).toEqual(["Je peux venir avec une remorque ?"]);
  });

  it("identifiant absent ou invalide (page sans JavaScript) : le serveur en crée un", async () => {
    const api = fakeApi(false);
    vi.stubGlobal("fetch", api.fetchMock);
    await expect(
      messageAction(
        request(),
        formOf({ intent: "contact_organizer", structureId: "s-1", body: "Bonjour", clientId: "pas-un-uuid" }),
      ),
    ).rejects.toBeInstanceOf(Response);
    expect(api.posted).toHaveLength(1);
    expect(api.posted[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(api.posted[0]).not.toBe("pas-un-uuid");
  });
});
