import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD } from "./helpers";

// Accueil complet (lot 30) dans l'appli, version web de recette (`expo start --web`), avec Kenji (département 66) :
// blocs, carte « Sponsorisé », réorganisation enregistrée et relue après rechargement, captures Béton / Sable.
// Prérequis : seed du lot 30, API avec `OVERPASS_URL=off`, `FUEL_API_URL=off`, `WEATHER_PROVIDER=off`.
// Lancer avec APP_URL=http://localhost:<port de Metro> (CORS_ORIGINS de l'API = même origine).
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/DELL/.claude/relais/orasso/lot-30-captures/appli";
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

test("appli : Accueil complet, réorganisation enregistrée", async ({ browser }) => {
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
    await expect(page.getByTestId("widget-nearby")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("nearby-radius")).toContainText("Rayon : 50 km");
    await expect(page.getByTestId("nearby-event").first()).toBeVisible();
    await expect(page.getByTestId("widget-garage")).toContainText("Garage du Port");
    await expect(page.getByTestId("widget-wash")).toContainText("OpenStreetMap");
    await expect(page.getByTestId("widget-fuel")).toContainText("data.economie.gouv.fr");
    await expect(page.getByTestId("sponsored-card")).toContainText("Polish avant saison");
    await expect(page.getByText("Sponsorisé", { exact: true })).toBeVisible();
    await shot(page, `01-accueil-${theme}`);

    // Réorganiser : Carburant remonte avant Lavage, Lavage masqué ; relu après rechargement.
    await page.getByTestId("open-reorder").click();
    await page.getByTestId("up-fuel").click();
    await expect
      .poll(async () =>
        (await apiCall<{ widgets: { order: string[] } }>(cookie, "GET", "/me/home")).data.widgets.order.indexOf("fuel"),
      )
      .toBe(6);
    await page.getByTestId("toggle-wash").click();
    await shot(page, `02-reorganiser-${theme}`);
    await expect
      .poll(
        async () => (await apiCall<{ widgets: { hidden: string[] } }>(cookie, "GET", "/me/home")).data.widgets.hidden,
      )
      .toEqual(["wash"]);
    await page.getByTestId("reorder-done").click();
    await page.reload();
    await expect(page.getByTestId("widget-fuel")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("widget-wash")).toHaveCount(0);
    await shot(page, `03-accueil-reorganise-${theme}`);
    await apiCall(cookie, "PUT", "/me/home/widgets", { order: [], hidden: [] });
    await ctx.close();
  }
  expect(errors.filter((e) => !/favicon|WebSocket|ws:\/\//.test(e))).toEqual([]);
});
