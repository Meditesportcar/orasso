import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/offlineCopy", () => ({ prunePhotos: async () => undefined }));

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
