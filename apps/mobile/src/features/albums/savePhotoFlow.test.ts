import { describe, expect, it } from "vitest";

import { saveFlow } from "./savePhotoFlow";

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

function setup() {
  const state = { open: true, same: true, shared: 0, released: 0 };
  const download = deferred<string>();
  const run = () =>
    saveFlow<string>({
      isOpen: () => state.open,
      sameAccount: () => state.same,
      download: () => download.promise,
      release: () => {
        state.released++;
      },
      isAvailable: async () => true,
      share: async () => {
        state.shared++;
      },
    });
  return { state, download, run };
}

describe("« Enregistrer » : le partage ne s'ouvre qu'écran ouvert et compte inchangé", () => {
  it("téléchargement terminé, écran ouvert : le partage s'ouvre", async () => {
    const t = setup();
    const p = t.run();
    t.download.resolve("f");
    expect(await p).toBe("shared");
    expect(t.state.shared).toBe(1);
  });
  it("téléchargement retardé, écran fermé entre-temps : rien ne s'ouvre, le fichier est libéré", async () => {
    const t = setup();
    const p = t.run();
    t.state.open = false;
    t.download.resolve("f");
    expect(await p).toBeNull();
    expect(t.state.shared).toBe(0);
    expect(t.state.released).toBe(1);
  });
  it("téléchargement retardé, compte changé entre-temps : rien ne s'ouvre, le fichier est libéré", async () => {
    const t = setup();
    const p = t.run();
    t.state.same = false;
    t.download.resolve("f");
    expect(await p).toBeNull();
    expect(t.state.shared).toBe(0);
    expect(t.state.released).toBe(1);
  });
});
