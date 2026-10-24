// Lot R1 (24/10) : les worklets passent par le vrai plugin Reanimated et sont relus comme le téléphone les exécute
// (voir worklets-audit.mjs). Un défaut de worklet ne se voit pas dans les recettes web : ce test le voit.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { auditAll, auditFile } from "./worklets-audit.mjs";

// Le plugin relit le fichier sur le disque : les essais sont écrits dans un dossier temporaire.
const dir = mkdtempSync(path.join(tmpdir(), "orasso-worklets-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const probe = (name, code) => {
  const file = path.join(dir, name);
  writeFileSync(file, code);
  return auditFile(file, code);
};

describe("worklets : ce qui tourne sur le fil UI du téléphone", () => {
  it("aucun défaut dans l'appli ni dans les composants natifs", () => {
    const { files, worklets, issues, reviewed } = auditAll();
    // Garde-fou : l'audit lit bien le code (plus de 100 worklets au 24/10).
    expect(files).toBeGreaterThan(30);
    expect(worklets).toBeGreaterThan(100);
    expect(issues).toEqual([]);
    // Chaque cas relu (REVIEWED) existe encore : sinon, l'enlever de la liste.
    expect(reviewed.length).toBeGreaterThan(0);
  });

  it("voit la constante de module en valeur par défaut (plantage de la loupe, 24/10)", () => {
    const code = `const LOUPE_SIZE = 112;
export function loupePlace(px: number, size = LOUPE_SIZE) {
  "worklet";
  return px - size / 2;
}`;
    expect(probe("defaut.ts", code).issues).toEqual([
      expect.stringMatching(/loupePlace.* « LOUPE_SIZE » n'existe pas sur le fil UI/),
    ]);
    const fixed = `const LOUPE_SIZE = 112;
export function loupePlace(px: number, sizeArg?: number) {
  "worklet";
  const size = sizeArg ?? LOUPE_SIZE;
  return px - size / 2;
}`;
    expect(probe("corrige.ts", fixed).issues).toEqual([]);
  });

  it("voit les appels de fonctions JS ordinaires, les rappels et l'Easing de react-native", () => {
    const code = `import { useRef } from "react";
import { Easing } from "react-native";
import { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
const double = (v: number) => v * 2;
const style = () => ({ opacity: 1 });
export function useProbe(onDone: () => void) {
  const sv = useSharedValue(0);
  const seen = useRef(0);
  useAnimatedStyle(style);
  sv.value = withTiming(1, { easing: Easing.out(Easing.cubic) });
  return useAnimatedStyle(() => {
    onDone();
    return { opacity: double(sv.value) + seen.current + Math.random() + Date.now() * 0 };
  });
}`;
    const { issues } = probe("appels.tsx", code);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/withTiming : Easing de react-native/),
        expect.stringMatching(/appel de « onDone\(\) » \(param\)/),
        expect.stringMatching(/appel de « double\(\) »/),
        expect.stringMatching(/capture « seen » \(useRef\(\)\)/),
      ]),
    );
    // `useAnimatedStyle(style)` : le plugin fait lui-même un worklet de la fonction passée par son nom (pas un défaut).
    expect(issues).toHaveLength(4);
  });
});
