import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7k1 : l'écran d'administration des emplacements sponsorisés (site à 390 et 1280 px, appli à 390 px), Béton et Sable.
// Captures « avant » (CAPTURES_DIR=…/avant) et « après » (…/apres). En « après » (R7K1_APRES=1), un annonceur externe est
// créé par l'API (réglage `sponsored.external_enabled` coupé) pour montrer l'avertissement, la pastille et l'aperçu ; le
// formulaire est rempli en mode « annonceur externe » et en mode « pro ».
// Lancer avec APP_URL=http://localhost:<port de l'appli> (appli compilée) ; le site et l'API tournent sur la base seedée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7k1-captures/apres`;
const APRES = process.env.R7K1_APRES === "1";
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
test.use({ actionTimeout: 30_000 });
type Theme = "beton" | "sable";

async function siteContext(browser: Browser, cookie: string, width: number, theme: Theme) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const url = new URL(WEB);
  const cookies = [{ name: "orasso-theme", value: theme, url: WEB }];
  for (const pair of cookie.split("; ").filter(Boolean)) {
    const i = pair.indexOf("=");
    cookies.push({ name: pair.slice(0, i), value: pair.slice(i + 1), url: `${url.protocol}//${url.host}` });
  }
  await ctx.addCookies(cookies);
  return ctx;
}

async function openApp(browser: Browser, theme: Theme) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((th) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", th);
  }, theme);
  await page.goto("/auth");
  await page.getByLabel("E-mail").fill("damien@orasso.local");
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 30_000 });
  return { ctx, page };
}

async function chooseAdmin(page: Page) {
  await page.goto("/moi");
  await page.getByTestId("casquette-admin").click();
  await page.waitForURL(/administration/, { timeout: 20_000 });
}

test("site : emplacements sponsorisés, Béton et Sable, 390 et 1280 px", async ({ browser }) => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  const damien = await login("damien@orasso.local");
  if (APRES) {
    const list = await apiCall<{ advertiserKind: string }[]>(damien, "GET", "/admin/sponsored-placements");
    if (!list.data.some((p) => p.advertiserKind === "external")) {
      const day = new Date().toISOString().slice(0, 10);
      const created = await apiCall(damien, "POST", "/admin/sponsored-placements", {
        advertiserKind: "external",
        advertiserName: "Assurance Soleil",
        disclosure: "Publicité",
        surfaces: ["feed"],
        title: "Assure ta sportive",
        body: "Un devis en deux minutes, sans engagement.",
        linkUrl: "https://www.assurance-soleil.fr/devis",
        departments: ["66"],
        startsOn: day,
        endsOn: "2027-12-31",
        dailyCap: 300,
        status: "active",
      });
      expect(created.status).toBe(201);
    }
  }
  for (const theme of ["beton", "sable"] as const) {
    for (const width of [390, 1280]) {
      const ctx = await siteContext(browser, damien, width, theme);
      const page = await ctx.newPage();
      await page.goto(`${WEB}/admin/sponsorises`);
      await page.waitForTimeout(1200);
      await expect(page.getByTestId("placement-form")).toBeVisible();
      await page.screenshot({ path: `${DIR}/site-sponsorises-${theme}-${width}.png`, fullPage: true });
      if (APRES) {
        // Formulaire en mode « annonceur externe » : avertissement, nom, Accueil grisé, aperçu en direct.
        await page.getByLabel("Annonceur").selectOption("external");
        await page.getByLabel("Nom de l'annonceur").fill("Assurance Soleil");
        await page.getByLabel("Mention (ex. Publicité)").fill("Publicité");
        await page.getByLabel("Titre (60 caractères)").fill("Assure ta sportive");
        await page.getByLabel("Texte (160 caractères)").fill("Un devis en deux minutes.");
        await page.getByLabel("Lien (https://…)").fill("https://www.assurance-soleil.fr/devis");
        await expect(page.getByTestId("external-warning")).toBeVisible();
        await page.getByTestId("placement-form").scrollIntoViewIfNeeded();
        await page.getByTestId("placement-form").screenshot({ path: `${DIR}/site-formulaire-externe-${theme}-${width}.png` });
      }
      await ctx.close();
    }
  }
});

test("appli : emplacements sponsorisés, Béton et Sable, 390 px", async ({ browser }) => {
  test.skip(!APP, "Appli : lancer avec APP_URL");
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  for (const theme of ["beton", "sable"] as const) {
    const { ctx, page } = await openApp(browser, theme);
    await chooseAdmin(page);
    await page.goto("/sponsorises");
    await page.waitForTimeout(3500);
    await expect(page.getByTestId("placement-form")).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `${DIR}/appli-sponsorises-haut-${theme}-390.png` });
    await page.getByTestId("placement-form").scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/appli-sponsorises-formulaire-${theme}-390.png` });
    await ctx.close();
  }
});
