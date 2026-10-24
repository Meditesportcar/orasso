import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { apiCall, loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { type LineupFixture, lineupFixture } from "./helpers/lotr4b";
import { RELAIS } from "./relais";

// Lot R4b, côté site (maquette R4.7) : la section « Le plateau » de la page de l'événement, après « Véhicules
// recherchés » (les prestataires présents l'ont rejointe), la page `/e/:slug/plateau` (non référencée), la ligne de
// `/app/sorties`. Trois regards : connecté (pseudo, cadenas, « Toi »), sans compte (ni pseudo ni lien), compte privé
// (son lien n'ouvre que la fiche de sa voiture). Béton et Sable, 390 et 1280 px. API et site lancés sur la base seedée.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r4b-captures/site`;
const NOCTURNE = "nocturne-de-canet-2026";

let fx: LineupFixture;
test.beforeAll(async () => {
  mkdirSync(DIR, { recursive: true });
  fx = await lineupFixture();
});

async function audit(page: Page) {
  const a = await auditPage(page);
  expect(a.greens).toEqual([]);
  expect(a.horizontalScroll).toBe(false);
  expect(a.truncated).toEqual([]);
}

test("sans compte : photos et modèles, aucun pseudo, « Connecte-toi », page du plateau non indexée", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/e/${fx.event.slug}`);
  const section = page.getByTestId("lineup");
  await expect(section).toBeVisible();
  await expect(section.getByTestId("lineup-car-name")).toHaveCount(2);
  await expect(section).not.toContainText(fx.publicPseudo);
  await expect(section).not.toContainText(fx.privatePseudo);
  await expect(page.locator("body")).not.toContainText(fx.privatePseudo);
  await expect(section.getByTestId("lineup-login")).toBeVisible();
  // Aucune vignette n'est un lien sans compte.
  await expect(section.locator("a.lu-car")).toHaveCount(0);
  // Le bloc de droite : « 2 retenus ».
  await expect(page.locator(".ev__counts")).toContainText("retenus");
  // Plus de section « Prestataires présents » à part.
  await expect(page.getByTestId("providers-present")).toHaveCount(0);
  await audit(page);

  const res = await page.goto(`/e/${fx.event.slug}/plateau`);
  expect(res?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByTestId("lineup-grid").getByTestId("lineup-car-name")).toHaveCount(2);
  await expect(page.locator("body")).not.toContainText(fx.publicPseudo);
  await audit(page);
});

test("l'API ne donne au visiteur aucun pseudo ni identifiant de compte", async () => {
  const res = await apiCall<{ cars: Record<string, unknown>[] }>(null, "GET", `/events/${fx.event.id}/lineup`);
  expect(res.status).toBe(200);
  for (const car of res.data.cars) {
    expect(Object.keys(car).sort()).toEqual(["generationName", "label", "makeName", "modelName", "photoUrl"]);
  }
});

test("connecté : pseudos, cadenas du compte privé (fiche de sa voiture, jamais le profil), compte public = profil", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginInBrowser(page, "kenji@orasso.local", SEED_PASSWORD, `/e/${fx.event.slug}`);
  await page.goto(`/e/${fx.event.slug}`);
  const section = page.getByTestId("lineup");
  await expect(section).toContainText(fx.publicPseudo);
  await expect(section).toContainText(fx.privatePseudo);
  const priv = section.getByTestId("lineup-car-private");
  await expect(priv).toHaveCount(1);
  await expect(priv).toHaveAttribute("href", /^\/v\//);
  await expect(section.getByTestId("lineup-car").first()).toHaveAttribute("href", /^\/u\//);
  await audit(page);
  await priv.click();
  await expect(page.getByTestId("vehicule")).toBeVisible();
  await expect(page.getByTestId("vehicule")).toHaveAttribute("data-detailed", "false");
});

test("la Nocturne : « Toi » sur la voiture de Kenji, « Voir les N voitures », catégories, onglet Pros", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginInBrowser(page, "kenji@orasso.local", SEED_PASSWORD, `/e/${NOCTURNE}`);
  await page.goto(`/e/${NOCTURNE}`);
  const section = page.getByTestId("lineup");
  await expect(section.getByTestId("lineup-car-me")).toHaveCount(1);
  await expect(section.getByTestId("lineup-car-me")).toContainText("Toi");
  await section.getByTestId("lineup-open").click();
  await expect(page).toHaveURL(new RegExp(`/e/${NOCTURNE}/plateau`));
  const grid = page.getByTestId("lineup-grid");
  await expect(grid.locator(".lu-car")).toHaveCount(30);
  await page.getByTestId("lineup-more").click();
  await expect(page.getByTestId("lineup-grid").locator(".lu-car")).toHaveCount(60);
  await audit(page);
  await page.getByTestId("lineup-tab-pros").click();
  await expect(page.getByTestId("lineup-pros")).toBeVisible();
});

test("/app/sorties : la ligne « Le plateau » d'une sortie retenue ouvre le plateau", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginInBrowser(page, "kenji@orasso.local", SEED_PASSWORD, "/app/sorties");
  await page.goto("/app/sorties");
  const line = page.getByTestId("ticket-lineup").first();
  await expect(line).toContainText(/Le plateau · \d+ voitures/);
  await line.click();
  await expect(page).toHaveURL(/\/plateau/);
});

for (const theme of ["beton", "sable"] as const) {
  for (const width of [390, 1280]) {
    test(`captures ${theme} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await setTheme(page, theme);
      await page.goto(`/e/${fx.event.slug}`);
      await page.getByTestId("lineup").scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${DIR}/${width}-fiche-visiteur-${theme}.png` });
      await loginInBrowser(page, "kenji@orasso.local", SEED_PASSWORD, `/e/${NOCTURNE}`);
      await page.goto(`/e/${NOCTURNE}`);
      await page.getByTestId("lineup").scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${DIR}/${width}-fiche-connecte-${theme}.png` });
      await page.goto(`/e/${fx.event.slug}/plateau`);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${DIR}/${width}-plateau-prive-${theme}.png`, fullPage: true });
      await page.goto("/app/sorties");
      await page.getByTestId("ticket-lineup").first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${DIR}/${width}-sorties-${theme}.png` });
    });
  }
}
