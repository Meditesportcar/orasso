// Champs de plaque envoyés à l'API depuis l'ajout du site (lot M1, tour 2) : jamais une photo sans décision.
import { describe, expect, it } from "vitest";

import { plateFields } from "./vehicle-add";

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe("plateFields", () => {
  it("cadres posés : ils partent tels quels", () => {
    const upload = new FormData();
    plateFields(form({ plateRects: '[{"x":0.1,"y":0.6,"w":0.3,"h":0.1}]' }), upload);
    expect(upload.get("plateRects")).toBe('[{"x":0.1,"y":0.6,"w":0.3,"h":0.1}]');
    expect(upload.get("noPlate")).toBeNull();
  });

  it("« aucune plaque visible » coché : noPlate=true", () => {
    const upload = new FormData();
    plateFields(form({ noPlate: "on" }), upload);
    expect(upload.get("noPlate")).toBe("true");
    expect(upload.get("plateRects")).toBeNull();
  });

  it("ni l'un ni l'autre : rien (l'API refusera la photo)", () => {
    const upload = new FormData();
    plateFields(form({}), upload);
    expect([...upload.keys()]).toEqual([]);
  });

  it("deuxième et troisième photos : leurs propres champs", () => {
    const upload = new FormData();
    plateFields(form({ noPlate: "on", plateRects2: '[{"x":0.2,"y":0.2,"w":0.2,"h":0.1}]' }), upload, "2");
    expect(upload.get("plateRects")).toBe('[{"x":0.2,"y":0.2,"w":0.2,"h":0.1}]');
    expect(upload.get("noPlate")).toBeNull();
  });
});
