import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { lineupFixture } from "./helpers/lotr4b";
import { RELAIS } from "./relais";

// Lot R6b (D37, « Suivre » comme sur Instagram) : captures « avant » et « après » du profil d'un membre dans ses états,
// de « Ton réseau » et de l'onglet Profil, appli et site, Béton et Sable. Même liste avant et après : `CAPTURES_DIR`
// choisit le dossier (`…/lot-r6b-captures/avant` ou `…/apres`). Aucune assertion sur le contenu : des photos à comparer.
// Appli : 390 et 384 px (largeur du Pixel de Damien). Site : 390 et 1280 px. APP_URL (appli compilée), API et site seedés.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r6b-captures/avant`;
test.use({ actionTimeout: 30_000 });

type Theme = "beton" | "sable";
const THEMES: Theme[] = ["beton", "sable"];

async function openApp(browser: Browser, theme: Theme, width: number) {
  const ctx = await browser.newContext({ viewport: { width, height: 2000 }, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  return { ctx, page };
}

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function signIn(page: Page, email: string) {
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 30_000 });
}

test("R6b captures : appli", async ({ browser }) => {
  test.skip(!APP, "Appli : lancer avec APP_URL");
  test.setTimeout(1_500_000);
  mkdirSync(`${DIR}/appli`, { recursive: true });
  const screens: [string, string, string][] = [
    ["kenji@orasso.local", "/profil", "profil-kenji"],
    ["kenji@orasso.local", "/profil-public", "apercu-kenji"],
    ["kenji@orasso.local", "/u/Julie_66", "u-julie-public-par-kenji"],
    ["kenji@orasso.local", "/u/Marc_66", "u-marc-prive-par-kenji"],
    ["kenji@orasso.local", "/u/Lea_11", "u-lea-par-kenji"],
    ["kenji@orasso.local", "/reseau", "reseau-kenji"],
    ["julie@orasso.local", "/u/Marc_66", "u-marc-prive-par-julie"],
    ["damien@orasso.local", "/reseau", "reseau-damien"],
    ["damien@orasso.local", "/u/Nina_34", "u-nina-par-damien"],
  ];
  for (const theme of THEMES) {
    for (const who of [...new Set(screens.map(([w]) => w))]) {
      for (const width of [390, 384]) {
        const { ctx, page } = await openApp(browser, theme, width);
        await signIn(page, who);
        for (const [w, path, name] of screens) {
          if (w !== who) continue;
          await page.goto(path);
          await afterOpening(page);
          await page.waitForTimeout(2200);
          await page.screenshot({ path: `${DIR}/appli/${name}-${theme}-${width}.png` });
        }
        await ctx.close();
      }
    }
  }
});

test("R6b captures : site", async ({ browser }) => {
  test.setTimeout(900_000);
  mkdirSync(`${DIR}/site`, { recursive: true });
  const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
  const pages: [string, string][] = [
    ["/app/moi", "moi"],
    ["/app/profil-public", "apercu"],
    ["/u/Julie_66", "u-julie-public"],
    ["/u/Marc_66", "u-marc-prive"],
    ["/u/Lea_11", "u-lea"],
    ["/app/reseau", "reseau"],
  ];
  for (const theme of THEMES) {
    for (const width of [390, 1280]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, baseURL: WEB });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, "kenji@orasso.local", SEED_PASSWORD, "/app/moi");
      for (const [path, name] of pages) {
        await page.goto(path);
        await page.waitForTimeout(1200);
        await page.screenshot({ path: `${DIR}/site/${name}-${theme}-${width}.png`, fullPage: true });
      }
      await ctx.close();
    }
  }
});

// Tour 2 (corrections R6b) : le menu ⋯ d'un abonné et sa confirmation « Retirer » (sans confirmer : le seed reste
// intact), et la feuille de la voiture d'un compte privé sur le plateau (« Demander à suivre », puis « Demandé »).
test("R6b tour 2 captures : appli (réseau « Retirer », plateau)", async ({ browser }) => {
  test.skip(!APP, "Appli : lancer avec APP_URL");
  test.setTimeout(900_000);
  mkdirSync(`${DIR}/appli`, { recursive: true });
  const fx = await lineupFixture();
  for (const theme of THEMES) {
    for (const width of [390, 384]) {
      const { ctx, page } = await openApp(browser, theme, width);
      await page.setViewportSize({ width, height: 844 });
      await signIn(page, "kenji@orasso.local");
      await page.goto("/reseau");
      await afterOpening(page);
      await page.getByTestId("net-person-more").first().click();
      await expect(page.getByTestId("net-follower-menu")).toBeVisible();
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${DIR}/appli/reseau-menu-retirer-${theme}-${width}.png` });
      await page.getByTestId("net-remove").click();
      await expect(page.getByTestId("net-remove-confirm")).toBeVisible();
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${DIR}/appli/reseau-retirer-confirmation-${theme}-${width}.png` });
      await page.getByTestId("net-remove-keep").click();
      await page.goto(`/e/${fx.event.slug}/plateau`);
      await afterOpening(page);
      await page.getByTestId("lineup-car-private").click();
      await expect(page.getByTestId("lineup-ask-follow")).toBeVisible();
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${DIR}/appli/plateau-prive-${theme}-${width}.png` });
      await ctx.close();
    }
  }
});

test("R6b tour 2 captures : site (réseau « Retirer »)", async ({ browser }) => {
  test.setTimeout(600_000);
  mkdirSync(`${DIR}/site`, { recursive: true });
  const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
  for (const theme of THEMES) {
    for (const width of [390, 1280]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, baseURL: WEB });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, "kenji@orasso.local", SEED_PASSWORD, "/app/reseau");
      await page.goto("/app/reseau?liste=abonnes");
      const row = page.getByTestId("net-person").first();
      await row.getByTestId("net-person-more").click();
      await row.getByTestId("net-remove").click();
      await expect(row.getByTestId("net-remove-confirm")).toBeVisible();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${DIR}/site/reseau-retirer-confirmation-${theme}-${width}.png`, fullPage: true });
      await ctx.close();
    }
  }
});
