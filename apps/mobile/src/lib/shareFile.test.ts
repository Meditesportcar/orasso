import { describe, expect, it } from "vitest";

import {
  exportCacheName,
  exportFileName,
  exportKindOf,
  exportWhileOpen,
  nativeShareOptions,
  releaseAction,
} from "./shareFile";

describe("fichiers qui sortent, branche du téléphone", () => {
  it("une photo sort en .jpg image/jpeg, une vidéo en .mp4 video/mp4 (jamais une vidéo déclarée en image)", () => {
    expect(exportKindOf("photo")).toEqual({ mime: "image/jpeg", ext: "jpg" });
    expect(exportKindOf()).toEqual({ mime: "image/jpeg", ext: "jpg" });
    expect(exportKindOf("video")).toEqual({ mime: "video/mp4", ext: "mp4" });
    expect(exportFileName("orasso-story.jpg", exportKindOf("video"))).toBe("orasso-story.mp4");
    expect(exportFileName("orasso-story.jpg", exportKindOf("photo"))).toBe("orasso-story.jpg");
    expect(exportCacheName("story-abc", exportKindOf("video"))).toBe("orasso-export-story-abc.mp4");
    expect(exportCacheName("story-abc", exportKindOf("photo"))).toBe("orasso-export-story-abc.jpg");
    expect(exportCacheName("a/../b", exportKindOf("photo"))).toBe("orasso-export-a____b.jpg");
  });

  it("la feuille du système reçoit le MIME et l'UTI du vrai type", () => {
    expect(nativeShareOptions("video/mp4", "share")).toMatchObject({ mimeType: "video/mp4", UTI: "public.mpeg-4" });
    expect(nativeShareOptions("image/jpeg", "share")).toMatchObject({ mimeType: "image/jpeg", UTI: "public.jpeg" });
    expect(nativeShareOptions("image/png", "save")).toMatchObject({
      UTI: "public.png",
      dialogTitle: "Enregistrer l'image",
    });
  });

  it("libérer un export efface le fichier du cache du téléphone ; une affiche gardée n'est pas touchée", () => {
    expect(releaseAction({ uri: "file:///cache/orasso-export-x.mp4", temp: true }, "android")).toBe("delete");
    expect(releaseAction({ uri: "file:///cache/orasso-export-x.jpg", temp: true }, "ios")).toBe("delete");
    expect(releaseAction({ uri: "file:///cache/orasso-1-story-a.png" }, "android")).toBe("none");
    expect(releaseAction({ uri: "blob:http://x/1" }, "web")).toBe("revoke");
    expect(releaseAction({ uri: "file:///x", temp: true }, "web")).toBe("none");
  });
});

describe("feuille fermée pendant le téléchargement", () => {
  const run = async (closeBeforeEnd: boolean) => {
    let open = true;
    const kept: string[] = [];
    const released: string[] = [];
    const sent: string[] = [];
    let finish: (f: string) => void = () => {};
    const pending = new Promise<string>((r) => {
      finish = r;
    });
    const job = exportWhileOpen(
      () => open,
      () => pending,
      (f) => kept.push(f),
      (f) => released.push(f),
      async (f) => {
        sent.push(f);
        return "shared" as const;
      },
    );
    // Téléchargement commencé, puis la feuille se ferme (le nettoyage au démontage libère ce qui est déjà gardé).
    if (closeBeforeEnd) {
      open = false;
      for (const f of kept.splice(0)) released.push(f);
    }
    finish("file:///cache/orasso-export-story-a.jpg");
    return { outcome: await job, kept, released, sent };
  };

  it("téléchargement commencé, fermeture, téléchargement terminé : fichier libéré, jamais de partage ouvert", async () => {
    const r = await run(true);
    expect(r.outcome).toBeNull();
    expect(r.sent).toEqual([]);
    expect(r.kept).toEqual([]);
    expect(r.released).toEqual(["file:///cache/orasso-export-story-a.jpg"]);
  });

  it("feuille ouverte jusqu'au bout : le fichier est gardé puis envoyé", async () => {
    const r = await run(false);
    expect(r.outcome).toBe("shared");
    expect(r.sent).toEqual(["file:///cache/orasso-export-story-a.jpg"]);
    expect(r.kept).toEqual(["file:///cache/orasso-export-story-a.jpg"]);
    expect(r.released).toEqual([]);
  });
});
