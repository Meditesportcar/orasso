import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7k2 : captures « avant » / « après » du Fil (carte en 4e position) et de l'Accueil (tuile sponsorisée du rail).
// PHASE=avant|apres. Appli : APP_URL (version compilée) ; site : API et site lancés sur la base seedée, avec un emplacement
// actif sur « home » et « feed » pour le département 66 (créé par la recette `lotr7k2-site.spec.ts` ou à la main).
const PHASE = process.env.PHASE ?? "apres";
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7k2-captures/${PHASE}`;
test.use({ actionTimeout: 30_000 });

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string, theme: string, width: number, scale: number) {
  const ctx = await browser.newContext({ viewport: { width, height: 860 }, baseURL: APP });
  await ctx.addInitScript(
    ([t, s]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t);
      if (Number(s) > 1) localStorage.setItem("orasso.recette.echellePolice", String(s));
    },
    [theme, scale] as const,
  );
  const page = await ctx.newPage();
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
  return { ctx, page };
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

const SIZES = [
  { w: 384, s: 1 },
  { w: 390, s: 1 },
  { w: 390, s: 1.3 },
] as const;

for (const theme of ["beton", "sable"]) {
  for (const { w, s } of SIZES) {
    test(`appli ${theme} ${w} police ${s}`, async ({ browser }) => {
      test.skip(!APP, "Appli : lancer avec APP_URL");
      test.setTimeout(240_000);
      const { ctx, page } = await open(browser, "kenji@orasso.local", theme, w, s);
      const tag = `${theme}-${w}-f${String(s).replace(".", "")}`;
      // Accueil : le rail « Autour du … » et sa tuile sponsorisée.
      await afterOpening(page);
      const tile = page.getByTestId("sponsored-card").first();
      if (await tile.count()) await tile.scrollIntoViewIfNeeded();
      await shot(page, `accueil-rail-${tag}`);
      // Le Fil : le haut, puis la 4e carte (la carte « Sponsorisé »).
      await page.goto("/fil");
      await afterOpening(page);
      await expect(page.getByTestId("fil-list")).toBeVisible({ timeout: 30_000 });
      await shot(page, `fil-${tag}`);
      const cards = page.getByTestId("fil-list").locator(":scope > *");
      await cards.nth(3).scrollIntoViewIfNeeded();
      await shot(page, `fil-quatrieme-${tag}`);
      await ctx.close();
    });
  }
  for (const width of [390, 1280]) {
    test(`site ${theme} ${width}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 900 });
      await setTheme(page, theme as "beton" | "sable");
      await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");
      await page.waitForTimeout(1500);
      const block = page.locator("#sponsored").first();
      if (await block.count()) await block.scrollIntoViewIfNeeded();
      mkdirSync(DIR, { recursive: true });
      await page.screenshot({ path: `${DIR}/site-accueil-${theme}-${width}.png` });
      await page.goto("/app/fil");
      await page.waitForSelector('[data-testid="fil-list"]', { timeout: 30_000 });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${DIR}/site-fil-${theme}-${width}.png` });
      const cards = page.locator('[data-testid="fil-list"] > *');
      await cards.nth(3).scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${DIR}/site-fil-quatrieme-${theme}-${width}.png` });
    });
  }
}
