import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { loginInBrowser, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot B3a, point 4 : la Page du propriétaire ne déborde pas au zoom 130 % (largeur CSS ~296 px) ni à 320 px : aucune barre de
// défilement horizontale, dans les deux thèmes. Captures : CAPTURES=1 (CAPTURES_DIR pour le dossier).
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-b3a-captures/site`;
const SHOTS = Boolean(process.env.CAPTURES);
test.use({ actionTimeout: 30_000 });

/** Éléments qui dépassent la largeur de la fenêtre (diagnostic lisible quand la recette échoue). */
async function overflowing(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = window.innerWidth;
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > w + 1) {
        const id = el.getAttribute("data-testid");
        out.push(
          `${el.tagName.toLowerCase()}${id ? `[${id}]` : ""}.${String(el.className).slice(0, 40)} right=${Math.round(r.right)} w=${Math.round(r.width)}`,
        );
      }
    }
    return out.slice(0, 12);
  });
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(DIR, { recursive: true });
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
}

for (const theme of ["beton", "sable"] as const) {
  for (const width of [296, 320]) {
    test(`Page du propriétaire à ${width} px (zoom 130 % : 296) en ${theme} : aucun défilement horizontal`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 700 });
      await loginInBrowser(page, "damien@orasso.local", undefined, "/orga/meditesportcar/page");
      await setTheme(page, theme);
      await page.goto("/orga/meditesportcar/page");
      await expect(page.getByTestId("owner-page")).toBeVisible();
      await shot(page, `page-proprietaire-${theme}-${width}`);
      // Le nom d'une seule pièce n'est pas coupé en plein mot : une seule ligne.
      const name = await page.getByTestId("page-name").evaluate((el) => ({
        h: el.getBoundingClientRect().height,
        line: Number.parseFloat(getComputedStyle(el).lineHeight),
      }));
      expect(name.h).toBeLessThan(name.line * 1.5);
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(scroll, `dépassent : ${(await overflowing(page)).join(" | ")}`).toBeLessThanOrEqual(0);
    });
  }
}
