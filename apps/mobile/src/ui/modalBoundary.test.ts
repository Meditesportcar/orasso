// Tout `<Modal` natif de l'appli est une fenêtre qui couvre l'écran et prend les appuis : une feuille rendue hors d'elle
// (zone des feuilles de l'écran) serait cachée dessous. Chaque `Modal` doit donc contenir une `SheetBoundary` (partie C du
// petit lot de fin). Ce test lit les sources : un `Modal` ajouté par un autre lot est pris dès la fusion.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [p] : [];
  });
}

/** Le texte d'un `<Modal …>…</Modal>` : jusqu'au `</Modal>` qui le ferme. */
function modals(source: string): string[] {
  const out: string[] = [];
  const open = /<Modal[\s>]/g;
  for (let m = open.exec(source); m; m = open.exec(source)) {
    const end = source.indexOf("</Modal>", m.index);
    out.push(end < 0 ? source.slice(m.index) : source.slice(m.index, end));
  }
  return out;
}

describe("frontière des feuilles", () => {
  it("tout <Modal> de l'appli contient une <SheetBoundary>", () => {
    const bare: string[] = [];
    let count = 0;
    for (const f of files(SRC)) {
      const source = readFileSync(f, "utf8");
      for (const body of modals(source)) {
        count++;
        if (!body.includes("<SheetBoundary>")) bare.push(relative(SRC, f));
      }
    }
    expect(count).toBeGreaterThanOrEqual(4);
    expect(bare).toEqual([]);
  });
});
