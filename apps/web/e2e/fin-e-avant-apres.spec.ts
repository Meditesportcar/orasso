import { mkdirSync, writeFileSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Petit lot de fin, partie E : captures avant / après du haut de l'onglet Crew (option B « Comme le Profil »), appli et site.
// À lancer sur la branche telle que reçue (`CAPTURES_DIR` = …/lot-fin-e-captures/avant) puis après (…/apres). Kenji (chef du
// crew « Roussillon Drift ») et Théo (membre de deux crews). Appli à 384 px (police ×1 et ×1,3, le Pixel de Damien) et 390 px
// (×1), site à 390 et 1 280 px, Béton et Sable. Les mesures du premier contenu du fil sont écrites dans `mesures.json`.
// Seulement des captures : les règles se vérifient dans `appli-lotfin-e` et `lotfin-e-site`.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-fin-e-captures/apres`;
const ONLY = process.env.ONLY ?? "";
test.use({ actionTimeout: 30_000 });

const measures: Record<string, number | null> = {};

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function skipOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function appLogin(browser: Browser, email: string, theme: string, width: number, scale: number): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, baseURL: APP });
  await ctx.addInitScript(
    ([t, s]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t);
      if (s > 1) localStorage.setItem("orasso.recette.echellePolice", String(s));
      else localStorage.removeItem("orasso.recette.echellePolice");
    },
    [theme, scale] as const,
  );
  const page = await ctx.newPage();
  await page.goto("/auth");
  await skipOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 30_000 });
  return page;
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await skipOpening(page);
  await expect(page.getByTestId("crew-feed").or(page.getByTestId("crew-tab-feed")).first()).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(1_200);
}

async function tap(page: Page, id: string): Promise<boolean> {
  const el = page.getByTestId(id).first();
  if (!(await el.count()) || !(await el.isVisible().catch(() => false))) return false;
  await el.click();
  await page.waitForTimeout(900);
  return true;
}

/** Le y du premier contenu du fil (le haut de `crew-feed`, juste sous la rangée d'onglets) dans la fenêtre. */
async function firstY(page: Page): Promise<number | null> {
  const box = await page.getByTestId("crew-feed").first().boundingBox();
  return box ? Math.round(box.y) : null;
}

test("fin E : captures avant / après (haut de l'onglet Crew, appli et site)", async ({ browser }) => {
  test.setTimeout(2_400_000);
  mkdirSync(DIR, { recursive: true });

  if (APP && ONLY !== "site") {
    for (const theme of ["beton", "sable"] as const) {
      for (const [width, scale] of [
        [384, 1],
        [384, 1.3],
        [390, 1],
      ] as const) {
        const tag = `${width}-x${scale}-${theme}`;
        let page = await appLogin(browser, "kenji@orasso.local", theme, width, scale);
        await go(page, "/crew");
        measures[`chef-${tag}`] = await firstY(page);
        await shot(page, `appli-chef-repos-${tag}`);
        // Défilé : le haut du crew est parti, la rangée d'onglets reste collée.
        await page.getByTestId("crew-tab").evaluate((el) => el.scrollTo(0, 900));
        await shot(page, `appli-chef-defile-${tag}`);
        await page.getByTestId("crew-tab").evaluate((el) => el.scrollTo(0, 0));
        await page.waitForTimeout(400);
        if (await tap(page, "crew-description-toggle")) await shot(page, `appli-chef-plus-${tag}`);
        if (await tap(page, "crew-cover-open")) {
          await shot(page, `appli-chef-vignette-${tag}`);
          await page.keyboard.press("Escape");
        }
        await page.context().close();

        // Théo, membre de deux crews : le haut avec ▾, « Mes crews » ouvert.
        page = await appLogin(browser, "theo@orasso.local", theme, width, scale);
        await go(page, "/crew");
        measures[`membre-${tag}`] = await firstY(page);
        await shot(page, `appli-membre-repos-${tag}`);
        if (await tap(page, "crew-selector")) await shot(page, `appli-membre-selecteur-${tag}`);
        await page.context().close();
      }
    }
  }

  for (const theme of ONLY === "app" ? [] : (["beton", "sable"] as const)) {
    for (const width of [390, 1280]) {
      const tag = `${width}-${theme}`;
      for (const who of ["kenji", "theo"] as const) {
        const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
        const page = await ctx.newPage();
        await setTheme(page, theme);
        await loginInBrowser(page, `${who}@orasso.local`, undefined, "/app");
        await page.goto("/app/crew");
        await page.waitForLoadState("networkidle");
        await shot(page, `site-${who}-repos-${tag}`);
        if (who === "kenji") {
          if (await tap(page, "crew-description-toggle")) await shot(page, `site-kenji-plus-${tag}`);
          if (await tap(page, "crew-cover-open")) {
            await shot(page, `site-kenji-vignette-${tag}`);
            await page.keyboard.press("Escape");
          }
          await page.goto("/app/crew?onglet=membres");
          await page.waitForLoadState("networkidle");
          await shot(page, `site-kenji-membres-${tag}`);
        }
        await ctx.close();
      }
    }
  }
  writeFileSync(`${DIR}/mesures.json`, JSON.stringify(measures, null, 1));
});
