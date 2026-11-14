// « Contacter <média> » (site, lot R9i tour 2) : l'appel est borné par un délai ; une réponse qui ne vient jamais est abandonnée, l'erreur
// est dite et le bouton redevient actif. (`apiFetch` abandonne la requête au `timeoutMs` demandé : `api.client.ts` ; ici il est simulé.)
import { createContactMediaFlow } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { CONTACT_MEDIA_TIMEOUT_MS, contactMediaCall } from "./contactMedia";

const KEY = "m:11111111-1111-4111-8111-111111111111";
type Fetcher = NonNullable<Parameters<typeof contactMediaCall>[1]>;

describe("contactMediaCall", () => {
  it("une réponse qui ne se termine jamais : requête abandonnée au délai, erreur dite, bouton libre", async () => {
    const asked: { path: string; timeoutMs?: number }[] = [];
    // Comme `apiFetch` : sans `timeoutMs`, une connexion qui reste ouverte n'est jamais abandonnée (la promesse ne se termine pas) ;
    // avec, la requête est abandonnée et rend l'erreur de connexion.
    const fetcher = ((path: string, init: { timeoutMs?: number } = {}) => {
      asked.push({ path, timeoutMs: init.timeoutMs });
      return new Promise((resolve) => {
        if (init.timeoutMs)
          setTimeout(
            () =>
              resolve({
                ok: false,
                status: 0,
                error: { code: "internal", message: "Connexion impossible. Réessaie." },
              }),
            5,
          );
      });
    }) as unknown as Fetcher;
    const call = contactMediaCall(KEY, fetcher);
    expect(call).not.toBeNull();
    const busy: boolean[] = [];
    const errors: (string | null)[] = [];
    const navigated: string[] = [];
    await createContactMediaFlow().open(call as NonNullable<typeof call>, {
      setBusy: (b) => busy.push(b),
      onError: (m) => errors.push(m),
      navigate: (id) => navigated.push(id),
    });
    expect(asked).toEqual([{ path: `/media/${KEY.slice(2)}/conversation`, timeoutMs: CONTACT_MEDIA_TIMEOUT_MS }]);
    expect(busy).toEqual([true, false]);
    expect(errors.at(-1)).toBe("Connexion impossible. Réessaie.");
    expect(navigated).toEqual([]);
  });
  it("réponse reçue : l'identifiant de la conversation ; refus : le libellé de l'API", async () => {
    const ok = (async () => ({ ok: true, status: 200, data: { id: "c1" } })) as unknown as Fetcher;
    expect(await contactMediaCall(KEY, ok)?.()).toEqual({ ok: true, conversationId: "c1" });
    const refused = (async () => ({
      ok: false,
      status: 403,
      error: { code: "forbidden", message: "Refusé." },
    })) as unknown as Fetcher;
    expect(await contactMediaCall(KEY, refused)?.()).toEqual({ ok: false, message: "Refusé." });
  });
  it("clé de média illisible : pas d'appel", () => {
    expect(contactMediaCall("n'importe quoi")).toBeNull();
  });
});
