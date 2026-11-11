import { mkdirSync } from "node:fs";
import { test } from "@playwright/test";

// Lot R8d : la maquette R8.5 `e-fiche` (source de vérité : `page-r8.js`, `ficheH` et `mentionsH` ; pas de capture de contrôle pour
// cet écran), rendue dans son propre fichier, pour les paires « maquette | réel ». Béton = premier téléphone, Sable = second.
const DIR = process.env.CAPTURES_DIR as string;
const STEPS: [string, string[]][] = [
  ["lydia-passionne-fiche", []],
  ["lydia-organisateur-fiche", ["fo:or"]],
  ["lydia-organisateur-mentions", ["mt:men"]],
  ["lydia-passionne-mentions", ["fo:pa"]],
  ["canet-avant-passionne-mentions", ["fe:av"]],
  ["canet-avant-passionne-fiche", ["mt:fiche"]],
];
test("maquette e-fiche", async ({ browser }) => {
  test.setTimeout(1_200_000);
  mkdirSync(DIR, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 1300 } });
  const page = await ctx.newPage();
  await page.goto("file:///C:/Users/Dams/Orasso/.claude/maquettes-r8/index.html#e-fiche");
  await page.waitForTimeout(2000);
  for (const [name, clicks] of STEPS) {
    for (const c of clicks) {
      await page.evaluate((d) => (document.querySelector(`[data-d="${d}"]`) as HTMLElement | null)?.click(), c);
      await page.waitForTimeout(600);
    }
    const rects = await page.evaluate(() =>
      [...document.querySelectorAll(".mq-phone")].map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height };
      }),
    );
    for (const [i, theme] of ["beton", "sable"].entries()) {
      const clip = rects[i];
      if (!clip) continue;
      await page.screenshot({ path: `${DIR}/maquette-${name}-${theme}.png`, clip, fullPage: true, animations: "disabled", timeout: 300_000 });
    }
  }
  await ctx.close();
});
