import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7e2 : captures « avant » / « après » du Fil (onglet, Explorer, composer du crew, site). PHASE=avant|apres.
// Appli : APP_URL (version compilée) ; site : API et site lancés sur la base seedée.
const PHASE = process.env.PHASE ?? "apres";
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7e2-captures/${PHASE}`;
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
  { w: 390, s: 1.3 },
] as const;

for (const theme of ["beton", "sable"]) {
  for (const { w, s } of SIZES) {
    test(`appli ${theme} ${w} police ${s}`, async ({ browser }) => {
      test.skip(!APP, "Appli : lancer avec APP_URL");
      test.setTimeout(240_000);
      const { ctx, page } = await open(browser, "kenji@orasso.local", theme, w, s);
      const tag = `${theme}-${w}-f${String(s).replace(".", "")}`;
      await page.goto("/fil");
      await afterOpening(page);
      await shot(page, `fil-${tag}`);
      await page.goto("/explorer");
      await afterOpening(page);
      await shot(page, `explorer-${tag}`);
      await page.goto("/crew/publier?crew=roussillon-drift");
      await afterOpening(page);
      await shot(page, `crew-publier-${tag}`);
      await ctx.close();
    });
  }
  for (const width of [390, 1280]) {
    test(`site ${theme} ${width}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 900 });
      await setTheme(page, theme as "beton" | "sable");
      await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/fil");
      await page.waitForTimeout(1500);
      mkdirSync(DIR, { recursive: true });
      await page.screenshot({ path: `${DIR}/site-fil-${theme}-${width}.png`, fullPage: false });
    });
  }
}
