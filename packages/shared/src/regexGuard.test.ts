import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Garde-fou (20/10/2026, demandé par Damien) : une barre oblique inverse perdue dans une expression régulière change
// son sens sans aucune erreur. `/s+/` coupe sur la lettre « s » au lieu des espaces (`/\s+/`), `[s,;]` aussi (`[\s,;]`).
// Arrivé deux fois (lot 41 : numéros de département ; lot 54 : initiales « La Brasa » → « LA »), rattrapé par la
// relecture. Ce test fouille le code des applications et des paquets et échoue s'il trouve un de ces motifs.

/** Motifs suspects : un `s`, `d` ou `w` nu là où `\s`, `\d` ou `\w` était voulu. */
const SUSPECTS: readonly { name: string; re: RegExp }[] = [
  // Expression qui commence par s, d ou w suivi d'un quantificateur : `/s+/`, `/^d+$/`, `/w*/`.
  { name: "\\s, \\d ou \\w sans barre oblique en tête d'expression", re: /(?:^|[^\w\\/.])\/\^?[sdw][+*?{]/ },
  // Classe de caractères qui commence par s, d ou w nu suivi d'un séparateur : `/[s,;]+/`, `/[^s]/`.
  { name: "classe [s…] au lieu de [\\s…]", re: /(?:^|[^\w\\/.])\/\^?\[\^?[sdw][,;|\]-]/ },
];

/** Lignes suspectes d'un texte source (numéro de ligne, motif, extrait). */
function findSuspects(source: string): { line: number; name: string; text: string }[] {
  const found: { line: number; name: string; text: string }[] = [];
  source.split("\n").forEach((text, i) => {
    for (const s of SUSPECTS) if (s.re.test(text)) found.push({ line: i + 1, name: s.name, text: text.trim() });
  });
  return found;
}

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
const SCANNED = [
  "apps/api/src",
  "apps/api/scripts",
  "apps/web/app",
  "apps/web/e2e",
  "apps/web/scripts",
  "apps/mobile/src",
  "apps/mobile/scripts",
  "packages/shared/src",
  "packages/design-system/src",
  "packages/design-system/scripts",
];
const SKIPPED_DIRS = new Set(["node_modules", "dist", "build", ".expo", ".react-router", "test-results"]);
const SELF = fileURLToPath(import.meta.url);

function sourceFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIPPED_DIRS.has(name) ? [] : sourceFiles(path);
    return /\.(ts|tsx|js|mjs)$/.test(name) && path !== SELF ? [path] : [];
  });
}

describe("garde-fou des expressions régulières (barre oblique inverse perdue)", () => {
  it("reconnaît les deux erreurs déjà rencontrées et leurs cousines", () => {
    for (const bad of [
      "const words = name.trim().split(/s+/).filter(Boolean);", // lot 54
      "const numbers = raw.split(/[s,;]+/);", // lot 41
      "if (/^d+$/.test(value)) return;",
      'const slug = title.replace(/w*/g, "");',
      "const parts = text.split(/[^s]+/);",
    ]) {
      expect(findSuspects(bad), bad).toHaveLength(1);
    }
  });

  it("laisse passer les expressions correctes et les chemins", () => {
    for (const good of [
      "const words = name.trim().split(/\\s+/);",
      "const numbers = raw.split(/[\\s,;]+/);",
      "if (/^\\d+$/.test(value)) return;",
      'router.push("/stand/" + id);',
      'const parts = path.split("/");',
      'const url = base + "/stand/s" + id;',
      "const re = /^vehicles\\/[0-9a-f-]{36}\\/[0-9a-f]{16}\\.webp$/;",
    ]) {
      expect(findSuspects(good), good).toEqual([]);
    }
  });

  it("aucun motif suspect dans le code des applications et des paquets", () => {
    const files = SCANNED.flatMap((d) => sourceFiles(join(ROOT, ...d.split("/"))));
    expect(files.length).toBeGreaterThan(200);
    const report = files.flatMap((file) =>
      findSuspects(readFileSync(file, "utf8")).map(
        (s) => `${relative(ROOT, file).split(sep).join("/")}:${s.line} — ${s.name} — ${s.text}`,
      ),
    );
    expect(report, "expression régulière à corriger (écris \\s, \\d ou \\w)").toEqual([]);
  });
});
