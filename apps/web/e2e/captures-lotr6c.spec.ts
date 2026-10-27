import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  addVehicleApi,
  apiCall,
  loginInBrowser,
  randomPlate,
  SEED_PASSWORD,
  setTheme,
  signUpApi,
  unique,
} from "./helpers";
import { RELAIS } from "./relais";

// Lot R6c (maquettes R6.3 à R6.7 : inviter à un événement, inviter dans un crew) : captures « avant » et « après » de la
// fiche de l'événement, de la confirmation de candidature, de la Boîte et de la page du crew, appli et site, Béton et
// Sable. Même liste avant et après : `CAPTURES_DIR` choisit le dossier (`…/lot-r6c-captures/avant` ou `…/apres`).
// Aucune assertion sur le contenu : des photos à comparer. Appli : 390 et 384 px (Pixel de Damien). Site : 390 et
// 1280 px. APP_URL (appli compilée), API et site seedés.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r6c-captures/avant`;
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

async function signIn(page: Page, email: string, password = SEED_PASSWORD) {
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(password);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 30_000 });
}

/** Écrans de l'appli : qui, chemin, nom, et l'onglet à toucher avant la photo. */
const APP_SCREENS: [string, string, string, string?][] = [
  ["kenji@orasso.local", "/e/nocturne-de-canet-2026", "fiche-nocturne-kenji"],
  ["kenji@orasso.local", "/e/rassemblement-narbonne", "fiche-narbonne-kenji"],
  ["kenji@orasso.local", "/boite", "boite-kenji"],
  ["kenji@orasso.local", "/crew/roussillon-drift", "crew-membres-kenji-chef", "crew-tab-members"],
  ["julie@orasso.local", "/crew/roussillon-drift", "crew-membres-julie", "crew-tab-members"],
  ["julie@orasso.local", "/e/nocturne-de-canet-2026", "fiche-nocturne-julie"],
];

test("R6c captures : appli", async ({ browser }) => {
  test.skip(!APP, "Appli : lancer avec APP_URL");
  test.setTimeout(1_800_000);
  mkdirSync(`${DIR}/appli`, { recursive: true });
  for (const theme of THEMES) {
    for (const who of [...new Set(APP_SCREENS.map(([w]) => w))]) {
      for (const width of [390, 384]) {
        const { ctx, page } = await openApp(browser, theme, width);
        await signIn(page, who);
        for (const [w, path, name, tab] of APP_SCREENS) {
          if (w !== who) continue;
          await page.goto(path);
          await afterOpening(page);
          await page.waitForTimeout(2200);
          if (tab) {
            await page.getByTestId(tab).click();
            await page.waitForTimeout(1200);
          }
          await page.screenshot({ path: `${DIR}/appli/${name}-${theme}-${width}.png` });
        }
        await ctx.close();
      }
    }
  }
});

test("R6c captures : appli, confirmation de candidature", async ({ browser }) => {
  test.skip(!APP, "Appli : lancer avec APP_URL");
  test.setTimeout(900_000);
  mkdirSync(`${DIR}/appli`, { recursive: true });
  for (const theme of THEMES) {
    for (const width of [390, 384]) {
      // Un compte neuf par photo : il candidate au Cars & Coffee de la Plage (sur sélection).
      const pseudo = `Cand${unique()}`.slice(0, 20);
      const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
      const cookie = await signUpApi(pseudo, email);
      await addVehicleApi(cookie, randomPlate());
      await apiCall(cookie, "GET", "/me");
      const { ctx, page } = await openApp(browser, theme, width);
      await signIn(page, email);
      await page.goto("/e/cars-and-coffee-plage");
      await afterOpening(page);
      await page.getByTestId("event-primary").click();
      await expect(page.getByTestId("cand-sheet")).toBeVisible({ timeout: 15_000 });
      const rules = page.getByTestId("cand-rules");
      if (await rules.isVisible().catch(() => false)) await rules.click();
      const seen = page.getByTestId("arrival-seen");
      if (await seen.isVisible().catch(() => false)) await seen.click();
      await page.getByTestId("cand-send").click();
      await expect(page.getByTestId("cand-done")).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${DIR}/appli/confirmation-candidature-${theme}-${width}.png` });
      await ctx.close();
    }
  }
});

test("R6c captures : site", async ({ browser }) => {
  test.setTimeout(900_000);
  mkdirSync(`${DIR}/site`, { recursive: true });
  const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
  const pages: [string, string, string][] = [
    ["kenji@orasso.local", "/e/nocturne-de-canet-2026", "fiche-nocturne-kenji"],
    ["kenji@orasso.local", "/e/rassemblement-narbonne", "fiche-narbonne-kenji"],
    ["kenji@orasso.local", "/app/boite", "boite-kenji"],
    ["kenji@orasso.local", "/app/boite/demandes", "boite-demandes-kenji"],
    ["kenji@orasso.local", "/c/roussillon-drift", "crew-kenji-chef"],
    ["kenji@orasso.local", "/app/sorties?candidature=envoyee", "confirmation-candidature-kenji"],
    ["julie@orasso.local", "/c/roussillon-drift", "crew-julie"],
  ];
  for (const theme of THEMES) {
    for (const width of [390, 1280]) {
      for (const who of [...new Set(pages.map(([w]) => w))]) {
        const ctx = await browser.newContext({ viewport: { width, height: 900 }, baseURL: WEB });
        const page = await ctx.newPage();
        await setTheme(page, theme);
        await loginInBrowser(page, who, SEED_PASSWORD, "/app/moi");
        for (const [w, path, name] of pages) {
          if (w !== who) continue;
          await page.goto(path);
          await page.waitForTimeout(1200);
          await page.screenshot({ path: `${DIR}/site/${name}-${theme}-${width}.png`, fullPage: true });
        }
        await ctx.close();
      }
    }
  }
});
