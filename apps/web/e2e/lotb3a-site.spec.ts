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
      await page.evaluate(() => document.fonts.ready);
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

/** Les mots d'un texte qui sont posés sur deux lignes (coupés en plein mot) dans les éléments choisis. */
async function splitWords(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const out: string[] = [];
    for (const el of document.querySelectorAll(sel)) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? "";
        for (const m of text.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, m.index ?? 0);
          range.setEnd(node, (m.index ?? 0) + m[0].length);
          const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
          if (tops.size > 1) out.push(m[0]);
        }
      }
    }
    return out;
  }, selector);
}

// Point 1 (côté site) : les titres d'événement ne se coupent jamais en plein mot, à 384 px et au zoom 130 % (~296 px).
for (const width of [384, 296]) {
  test(`titres d'événement à ${width} px : aucun mot coupé, aucun défilement horizontal`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/evenements");
    await expect(page.getByTestId("event-tile").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await shot(page, `evenements-${width}`);
    expect(await splitWords(page, ".w-card__title, .w-card__minimal-title")).toEqual([]);
    await page.goto("/e/rassemblement-du-lydia");
    await expect(page.locator("h1").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await shot(page, `fiche-lydia-${width}`);
    expect(await splitWords(page, "h1, h2")).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
}
