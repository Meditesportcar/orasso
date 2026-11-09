import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7i : captures avant / après des écrans touchés par « Rendez-vous au spot » (Accueil, Fil, onglet Spots du crew, page
// du crew). À lancer sur la branche telle que reçue (`CAPTURES_DIR` = …/lot-r7i-captures/avant) puis après le lot (…/apres).
// Damien_66 (Accueil, Fil), Kenji (chef du crew « Roussillon Drift » : onglet Spots). Appli à 384 px (police 1 et 1,3, Pixel
// de Damien) et 390 px (police 1), site à 390 et 1 280 px, Béton et Sable. Seulement des captures : les règles se vérifient
// dans `appli-lotr7i` et `lotr7i-site`.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7i-captures/apres`;
const ONLY = process.env.ONLY ?? "";
test.use({ actionTimeout: 30_000 });

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
  const dismiss = page.getByTestId("whatsnew-dismiss");
  await dismiss.click({ timeout: 3_000 }).catch(() => undefined);
  return page;
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await skipOpening(page);
  await page.waitForTimeout(1_500);
}

async function tap(page: Page, id: string): Promise<boolean> {
  const el = page.getByTestId(id).first();
  if (!(await el.count())) return false;
  await el.click();
  await page.waitForTimeout(900);
  return true;
}

test("R7i : captures avant / après (Accueil, Fil, onglet Spots, page du crew ; appli et site)", async ({ browser }) => {
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
        let page = await appLogin(browser, "damien@orasso.local", theme, width, scale);
        await go(page, "/accueil");
        await shot(page, `appli-accueil-${tag}`);
        await go(page, "/fil");
        await shot(page, `appli-fil-${tag}`);
        await page.context().close();

        page = await appLogin(browser, "kenji@orasso.local", theme, width, scale);
        await go(page, "/crew");
        await shot(page, `appli-crew-${tag}`);
        if (await tap(page, "crew-tab-spots")) await shot(page, `appli-crew-spots-${tag}`);
        await page.context().close();
      }
    }
  }

  for (const theme of ONLY === "app" ? [] : (["beton", "sable"] as const)) {
    for (const width of [390, 1280]) {
      const tag = `${width}-${theme}`;
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, "damien@orasso.local", undefined, "/app");
      for (const [name, path] of [
        ["accueil", "/app"],
        ["fil", "/app/fil"],
      ] as const) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await shot(page, `site-${name}-${tag}`);
      }
      await ctx.close();

      const ctxK = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const pageK = await ctxK.newPage();
      await setTheme(pageK, theme);
      await loginInBrowser(pageK, "kenji@orasso.local", undefined, "/app");
      for (const [name, path] of [
        ["crew", "/app/crew"],
        ["crew-spots", "/app/crew?onglet=spots"],
      ] as const) {
        await pageK.goto(path);
        await pageK.waitForLoadState("networkidle");
        await shot(pageK, `site-${name}-${tag}`);
      }
      await ctxK.close();
    }
  }
});
