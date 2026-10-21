import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD } from "./helpers";
import { RELAIS } from "./relais";

// Accueil complet (lot 30) dans l'appli, version web de recette (`expo start --web`), avec Kenji (département 66) :
// lot C2a : l'Accueil de l'artefact DA v2 (carte, météo, mini-tickets, rail d'affiches, Passeport), sans les blocs
// réglables, le sponsorisé ni « Réorganiser » ; captures Béton / Sable.
// Prérequis : seed du lot 30, API avec `OVERPASS_URL=off`, `FUEL_API_URL=off`, `WEATHER_PROVIDER=off`.
// Pour une suite avec meteo.spec.ts : `open-meteo` avec `METEO_URL` vers son stub local convient aussi.
// Lancer avec APP_URL=http://localhost:<port de Metro> (CORS_ORIGINS de l'API = même origine).
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-30-captures/appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");

async function open(browser: import("@playwright/test").Browser, theme: "beton" | "sable") {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  await page.goto("/auth");
  await page.getByLabel("E-mail").fill("kenji@orasso.local");
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 30_000 });
  return { ctx, page };
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
}

test("appli : Accueil du passionné (artefact DA v2), sans le fourre-tout", async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  const cookie = await login("kenji@orasso.local");
  await apiCall(cookie, "PUT", "/me/home/widgets", { order: [], hidden: [] });
  await apiCall(cookie, "PATCH", "/me/settings", { radiusKm: 50 });
  const errors: string[] = [];

  for (const theme of ["sable", "beton"] as const) {
    const { ctx, page } = await open(browser, theme);
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text().slice(0, 200));
    });
    // Lot C2a (artefact DA v2 `s-home`) : la salutation, la carte du prochain événement, puis seulement la météo, les
    // autres sorties en mini-tickets, « Tu es staff », le rail « Autour du 66 ce mois-ci » et le Passeport.
    await expect(page.getByTestId("home-greeting")).toContainText(/Salut Kenji/i, { timeout: 30_000 });
    await expect(page.getByTestId("home-hero")).toBeVisible();
    await expect(page.getByTestId("home-rail-item").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Autour du 66 ce mois-ci", { exact: true })).toBeVisible();
    await expect(page.getByTestId("home-passport")).toContainText("Passeport Orasso");
    // Le fourre-tout retiré (audit § 5.2) : blocs réglables, sponsorisé, Réorganiser, grand titre.
    for (const id of [
      "widget-nearby",
      "widget-garage",
      "widget-wash",
      "widget-fuel",
      "sponsored-card",
      "open-reorder",
    ]) {
      await expect(page.getByTestId(id), id).toHaveCount(0);
    }
    await expect(page.getByRole("heading", { name: "Accueil", exact: true })).toHaveCount(0);
    await shot(page, `01-accueil-${theme}`);
    await ctx.close();
  }
  expect(errors.filter((e) => !/favicon|WebSocket|ws:\/\//.test(e))).toEqual([]);
});
