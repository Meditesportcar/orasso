import { mkdirSync, writeFileSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R8f1 : captures « avant » / « après » du haut du Fil. Appli (version compilée, `APP_URL`) : Béton et Sable, 384 et
// 390 px, police ×1, ×1,15 et ×1,3 : les trois filtres, l'état vide d'« Abonnements », « Choisis ton coin » (Autour de moi
// sans coin), le choix « Publier » ouvert. Site (`/app/fil`, API et site lancés) : 390 et 1280 px. PHASE=avant|apres.
// La hauteur entre le bas de la barre des stories et le haut de la première carte (appli, 390 px, police ×1) est écrite
// dans `hauteur-stories-carte.txt`. Comptes du seed seulement.
const PHASE = process.env.PHASE ?? "apres";
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r8f1-captures/${PHASE}`;
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
  await page.goto("/fil");
  await afterOpening(page);
  await expect(page.getByTestId("fil-publish-open")).toBeVisible({ timeout: 30_000 });
  return { ctx, page };
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function loaded(page: Page) {
  await expect(page.getByTestId("fil-waiting")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("fil-list").or(page.getByTestId("fil-empty"))).toBeVisible({ timeout: 30_000 });
}

for (const theme of ["beton", "sable"]) {
  for (const width of [384, 390]) {
    for (const scale of [1, 1.15, 1.3]) {
      test(`appli ${theme} ${width} police ${scale}`, async ({ browser }) => {
        test.skip(!APP, "Appli : lancer avec APP_URL");
        test.setTimeout(300_000);
        const tag = `${theme}-${width}-x${String(scale).replace(".", "")}`;
        const { ctx, page } = await open(browser, "damien@orasso.local", theme, width, scale);
        await page.getByTestId("fil-filters-for_you").click();
        await loaded(page);
        await shot(page, `fil-pour-toi-${tag}`);
        if (theme === "beton" && width === 390 && scale === 1) {
          const gap = await page.evaluate(() => {
            const q = (id: string) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect();
            const bar = q("stories-bar");
            const list = q("fil-list");
            return bar && list ? Math.round((list.top - bar.bottom) * 10) / 10 : null;
          });
          mkdirSync(DIR, { recursive: true });
          writeFileSync(`${DIR}/hauteur-stories-carte.txt`, `${gap}\n`);
        }
        await page.getByTestId("fil-publish-open").click();
        await expect(page.getByTestId("fil-publish-choose-story")).toBeVisible();
        await shot(page, `fil-choix-publier-${tag}`);
        await ctx.close();
        const few = await open(browser, "paul.photo@orasso.local", theme, width, scale);
        await few.page.getByTestId("fil-filters-following").click();
        await loaded(few.page);
        await shot(few.page, `fil-abonnements-vide-${tag}`);
        await few.page.getByTestId("fil-filters-nearby").click();
        await loaded(few.page);
        await shot(few.page, `fil-autour-de-moi-${tag}`);
        await few.ctx.close();
      });
    }
  }
}

for (const theme of ["beton", "sable"] as const) {
  for (const width of [390, 1280]) {
    test(`site ${theme} ${width}`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width, height: 900 });
      await setTheme(page, theme);
      await loginInBrowser(page, "damien@orasso.local", undefined, "/app/fil");
      await loaded(page);
      await shot(page, `site-fil-pour-toi-${theme}-${width}`);
      await page.getByTestId("fil-publish-open").click();
      await expect(page.getByTestId("fil-publish-choose-story")).toBeVisible();
      await shot(page, `site-fil-choix-publier-${theme}-${width}`);
      await page.getByTestId("fil-publish-open").click();
      await page.getByTestId("fil-filters-following").click();
      await loaded(page);
      await shot(page, `site-fil-abonnements-${theme}-${width}`);
      await page.getByTestId("fil-filters-nearby").click();
      await loaded(page);
      await shot(page, `site-fil-autour-de-moi-${theme}-${width}`);
    });
  }
}
