import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R5c2 : paires de captures avant / après de la page du crew, à lancer sur la branche telle que reçue
// (`CAPTURES_DIR` = …/lot-r5c2-captures/avant) puis après le lot (…/apres). Crew du seed « Roussillon Drift » : Kenji
// (chef), Léa (membre), Sarah (pas membre). Appli à 390 et 384 px (Pixel de Damien), site à 390 et 1 280 px, Béton et
// Sable. Écrans : page du crew (haut et bas), « Rejoindre un crew », Explorer « Personnes et crews ». Seulement des
// captures : les règles se vérifient dans `appli-lotr5c2` et `lotr5c2-site`.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r5c2-captures/apres`;
const SLUG = "roussillon-drift";
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

async function appLogin(browser: Browser, email: string, theme: string, width: number): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  await page.goto("/auth");
  await skipOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 30_000 });
  return page;
}

/** Fait défiler la page de l'appli (défilement interne de React Native Web) d'un écran vers le bas. */
async function scrollDown(page: Page, times = 1) {
  const { width, height } = page.viewportSize() ?? { width: 390, height: 844 };
  await page.mouse.move(width / 2, height / 2);
  for (let i = 0; i < times; i++) {
    await page.mouse.wheel(0, height - 160);
    await page.waitForTimeout(400);
  }
}

test("R5c2 : captures avant / après (page du crew, vitrine, rejoindre)", async ({ browser }) => {
  test.setTimeout(1_500_000);
  mkdirSync(DIR, { recursive: true });

  if (APP) {
    for (const theme of ["beton", "sable"] as const) {
      for (const width of [390, 384]) {
        const tag = `${width}-${theme}`;
        // Chef : page du crew, haut puis deux écrans plus bas.
        const k = await appLogin(browser, "kenji@orasso.local", theme, width);
        await k.goto(`/crew/${SLUG}`);
        await skipOpening(k);
        await expect(k.getByTestId("crew")).toBeVisible({ timeout: 30_000 });
        await shot(k, `appli-crew-chef-haut-${tag}`);
        await scrollDown(k);
        await shot(k, `appli-crew-chef-milieu-${tag}`);
        await scrollDown(k, 2);
        await shot(k, `appli-crew-chef-bas-${tag}`);
        await k.context().close();

        // Membre.
        const l = await appLogin(browser, "lea@orasso.local", theme, width);
        await l.goto(`/crew/${SLUG}`);
        await skipOpening(l);
        await expect(l.getByTestId("crew")).toBeVisible({ timeout: 30_000 });
        await shot(l, `appli-crew-membre-haut-${tag}`);
        await scrollDown(l);
        await shot(l, `appli-crew-membre-bas-${tag}`);
        await l.context().close();

        // Pas membre : vitrine, « Rejoindre un crew », Explorer.
        const s = await appLogin(browser, "sarah@orasso.local", theme, width);
        await s.goto(`/crew/${SLUG}`);
        await skipOpening(s);
        await expect(s.getByTestId("crew")).toBeVisible({ timeout: 30_000 });
        await shot(s, `appli-crew-vitrine-haut-${tag}`);
        await scrollDown(s);
        await shot(s, `appli-crew-vitrine-bas-${tag}`);
        await s.goto("/rejoindre-crew");
        await skipOpening(s);
        await s.getByTestId("crew-join-q").locator("input").first().fill("Roussillon").catch(async () => {
          await s.getByTestId("crew-join-q").fill("Roussillon");
        });
        await expect(s.getByTestId("crew-row").first()).toBeVisible({ timeout: 20_000 });
        await shot(s, `appli-rejoindre-crew-${tag}`);
        await s.goto("/explorer");
        await skipOpening(s);
        await s.getByText("Personnes et crews").first().click();
        await s.getByTestId("people-q").fill("Roussillon");
        await expect(s.getByTestId("crew-row").first()).toBeVisible({ timeout: 20_000 });
        await shot(s, `appli-explorer-crews-${tag}`);
        await s.context().close();
      }
    }
  }

  for (const theme of ["beton", "sable"] as const) {
    for (const width of [390, 1280]) {
      const tag = `${width}-${theme}`;
      for (const [who, email] of [
        ["chef", "kenji@orasso.local"],
        ["membre", "lea@orasso.local"],
        ["vitrine", "sarah@orasso.local"],
      ] as const) {
        const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
        const page = await ctx.newPage();
        await setTheme(page, theme);
        await loginInBrowser(page, email, undefined, `/c/${SLUG}`);
        await page.goto(`/c/${SLUG}`);
        await expect(page.getByTestId("crew")).toBeVisible({ timeout: 30_000 });
        await shot(page, `site-crew-${who}-haut-${tag}`);
        await page.mouse.wheel(0, width === 390 ? 760 : 820);
        await shot(page, `site-crew-${who}-bas-${tag}`);
        if (who === "vitrine") {
          await page.goto("/app/crews/rejoindre?q=Roussillon");
          await shot(page, `site-rejoindre-crew-${tag}`);
        }
        await ctx.close();
      }
    }
  }
});
