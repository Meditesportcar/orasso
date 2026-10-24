import { mkdirSync } from "node:fs";
import { type Browser, type Page, test } from "@playwright/test";
import { loginInBrowser, MOBILE, SEED_PASSWORD, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R4b : captures « avant » (branche de départ) et « après » des écrans touchés par le plateau, Béton et Sable :
// appli à 390 px (fiche de la Nocturne de Canet, Mes sorties à venir et passées), site à 390 et 1280 px (page de
// l'événement, Mes sorties). `PHASE=avant|apres` (défaut : apres). Appli : APP_URL (version compilée).
const PHASE = process.env.PHASE === "avant" ? "avant" : "apres";
const DIR = `${process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r4b-captures`}/${PHASE}`;
const APP = process.env.APP_URL;
const SLUG = "nocturne-de-canet-2026";
const THEMES = ["beton", "sable"] as const;

test.beforeAll(() => mkdirSync(DIR, { recursive: true }));

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false)) await skip.click({ position: { x: 40, y: 600 } }).catch(() => {});
  await page.getByTestId("opening-battle").waitFor({ state: "detached", timeout: 10_000 }).catch(() => {});
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

async function appPage(browser: Browser, theme: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  await go(page, "/auth");
  await page.getByLabel("E-mail").fill("kenji@orasso.local");
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 30_000 });
  return page;
}

const shot = async (page: Page, name: string) => {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${DIR}/${name}.png` });
};

for (const theme of THEMES) {
  test(`appli ${theme}`, async ({ browser }) => {
    test.skip(!APP, "Appli : lancer avec APP_URL");
    const page = await appPage(browser, theme);
    await go(page, `/e/${SLUG}`);
    await page.getByText("Nocturne de Canet").first().waitFor();
    await shot(page, `appli-fiche-haut-${theme}`);
    // Les lignes Quand / Où / Places, puis ce qui suit (le plateau, après).
    await page.mouse.move(195, 500);
    await page.mouse.wheel(0, 700);
    await shot(page, `appli-fiche-lignes-${theme}`);
    await page.mouse.wheel(0, 700);
    await shot(page, `appli-fiche-suite-${theme}`);
    await go(page, "/sorties");
    await page.getByTestId("sorties-segments").waitFor();
    await shot(page, `appli-sorties-venir-${theme}`);
    await page.getByTestId("sorties-segments").getByText(/Passées/).click();
    await shot(page, `appli-sorties-passees-${theme}`);
    if (PHASE === "apres") {
      await go(page, `/e/${SLUG}/plateau`);
      await page.getByTestId("lineup-grid").waitFor();
      await shot(page, `appli-plateau-${theme}`);
      await page.getByTestId("lineup-tab-pros").click();
      await shot(page, `appli-plateau-pros-${theme}`);
    }
    await page.context().close();
  });

  for (const width of [390, 1280]) {
    test(`site ${theme} ${width}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      // Sans compte d'abord.
      await page.goto(`/e/${SLUG}`);
      await page.locator("#ev-title").waitFor();
      await shot(page, `site-${width}-fiche-haut-visiteur-${theme}`);
      const section = page.getByTestId(PHASE === "apres" ? "lineup" : "providers-present");
      if (await section.count()) {
        await section.first().scrollIntoViewIfNeeded();
        await shot(page, `site-${width}-fiche-plateau-visiteur-${theme}`);
      }
      await loginInBrowser(page, "kenji@orasso.local", SEED_PASSWORD, `/e/${SLUG}`);
      await page.goto(`/e/${SLUG}`);
      await page.locator("#ev-title").waitFor();
      if (await section.count()) {
        await section.first().scrollIntoViewIfNeeded();
        await shot(page, `site-${width}-fiche-plateau-connecte-${theme}`);
      }
      if (PHASE === "apres") {
        await page.goto(`/e/${SLUG}/plateau`);
        await shot(page, `site-${width}-plateau-${theme}`);
      }
      await page.goto("/app/sorties");
      await shot(page, `site-${width}-sorties-${theme}`);
      await ctx.close();
    });
  }
}
