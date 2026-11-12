import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/kv", () => ({ accountGuard: () => ({ scope: "a", current: () => true }) }));
vi.mock("@/lib/offlineCopy", () => ({
  prunePhotos: async () => undefined,
  deletePhoto: vi.fn(async () => undefined),
  readCopy: vi.fn(async () => null),
  saveCopy: vi.fn(async () => undefined),
}));

import { photoResponseAction } from "./copyPhotos";

describe("photo du Fil : que faire de la réponse du serveur", () => {
  it("200 : on l'affiche ; 401, 403, 404, 410 : la photo gardée est effacée et ne s'affiche jamais", () => {
    expect(photoResponseAction(200)).toBe("show");
    for (const status of [401, 403, 404, 410]) expect(photoResponseAction(status)).toBe("forget");
  });
  it("une autre erreur (429, 500) : le repli, jamais la photo gardée", () => {
    for (const status of [429, 500, 503]) expect(photoResponseAction(status)).toBe("fallback");
  });
});

describe("copies : garde du compte et photos refusées", () => {
  it("gardée → 500 → 404 dans le repli → remontage hors ligne : aucune photo", async () => {
    const store = new Map<string, string>([["/p.jpg", "data:image/jpeg;base64,AA"]]);
    const mod = await import("./copyPhotos");
    // `deletePhoto` simulé sur la table : seul un refus efface.
    const { deletePhoto } = await import("@/lib/offlineCopy");
    vi.mocked(deletePhoto).mockImplementation(async (url: string) => void store.delete(url));
    await mod.forgetIfRefused("/p.jpg", 500);
    expect(store.has("/p.jpg")).toBe(true);
    await mod.forgetIfRefused("/p.jpg", 404);
    expect(store.has("/p.jpg")).toBe(false);
  });

  it("A → B entre la lecture et l'écriture : rien n'est écrit sous B", async () => {
    const { readCopy, saveCopy } = await import("@/lib/offlineCopy");
    let scope = "a";
    const card = { id: "feed_post:x", kind: "feed_post", payload: { post: { photos: [] } } };
    vi.mocked(readCopy).mockImplementation(async () => {
      const value = { filter: "for_you", items: [card, { ...card, id: "feed_post:y" }] };
      scope = "b"; // B devient courant juste après la lecture
      return { value, savedAt: new Date(0).toISOString() } as never;
    });
    vi.mocked(saveCopy).mockClear();
    const { dropFromCopies } = await import("./copyPhotos");
    await dropFromCopies("feed_post:x", { scope: "a", current: () => scope === "a" });
    expect(saveCopy).not.toHaveBeenCalled();
  });
});
