import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { SEED_PASSWORD } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7b2 (D38), côté appli (version web compilée de recette) : l'onglet Crew. Sélecteur avec deux crews (Théo : « Roussillon
// Drift » et « Côte Vermeille Classic » du seed) et dernier crew ouvert mémorisé ; onglets Fil · Sorties · Membres · Spots
// (plus de Garage), voitures dans la fiche d'un membre, Spots = état vide avec bouton grisé expliqué ; Discussion en bouton ;
// sans crew (Paul) : rejoindre ou créer, recherche de deux lettres ; la page d'un crew vue d'un non-membre est la vitrine
// (ni fil, ni sorties, ni photo de crew) ; un membre y est renvoyé vers l'onglet. Lancer avec APP_URL, API seedée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7b2-captures/apres/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string, theme = "beton") {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 860 }, baseURL: APP });
  await ctx.addInitScript((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  const page = await ctx.newPage();
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
  return { ctx, page };
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

test("sélecteur : deux crews, le dernier ouvert revient", async ({ browser }) => {
  test.setTimeout(180_000);
  const { ctx, page } = await open(browser, "theo@orasso.local");
  await go(page, "/crew");
  await expect(page.getByTestId("crew-selector")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("crew-selector").click();
  await expect(page.getByTestId("crew-selector-list")).toBeVisible();
  await shot(page, "selecteur-ouvert");
  await page.getByTestId("crew-choice-cote-vermeille-classic").click();
  await expect(page.getByText("Côte Vermeille Classic").first()).toBeVisible({ timeout: 20_000 });
  // Retour plus tard sur l'onglet : le dernier ouvert revient, sans paramètre.
  await go(page, "/crew");
  await expect(page.getByTestId("crew-selector")).toContainText("Côte Vermeille Classic", { timeout: 30_000 });
  await expect(page.getByTestId("crew-choice-more")).toHaveCount(0);
  await page.getByTestId("crew-selector").click();
  await expect(page.getByTestId("crew-choice-more")).toBeVisible();
  await ctx.close();
});

test("un crew : Fil · Sorties · Membres · Spots, Discussion, voitures dans la fiche d'un membre", async ({ browser }) => {
  test.setTimeout(180_000);
  const { ctx, page } = await open(browser, "kenji@orasso.local");
  await go(page, "/crew");
  await expect(page.getByTestId("crew-tabs")).toBeVisible({ timeout: 30_000 });
  // Un seul crew : le nom seul, pas de sélecteur.
  await expect(page.getByTestId("crew-selector")).toHaveCount(0);
  await expect(page.getByTestId("crew-selector-single")).toBeVisible();
  // Quatre onglets, plus de Garage.
  await expect(page.getByTestId("crew-tab-feed")).toBeVisible();
  await expect(page.getByTestId("crew-tab-outings")).toBeVisible();
  await expect(page.getByTestId("crew-tab-members")).toBeVisible();
  await expect(page.getByTestId("crew-tab-spots")).toBeVisible();
  await expect(page.getByTestId("crew-tab-garage")).toHaveCount(0);
  // Fil : le composeur est le bouton principal de l'onglet.
  await expect(page.getByTestId("crew-feed-publish")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("crew-discussion")).toBeVisible();
  await expect(page.getByTestId("crew-settings")).toBeVisible();
  await page.getByTestId("crew-tab-outings").click();
  await expect(page.getByTestId("crew-outings")).toBeVisible();
  await page.getByTestId("crew-tab-members").click();
  await expect(page.getByTestId("crew-members")).toBeVisible();
  const members = page.getByTestId("crew-member");
  await expect(members.first()).toBeVisible();
  await members.first().click();
  await expect(page.getByTestId("crew-member-sheet")).toBeVisible();
  await expect(page.getByTestId("crew-member-profile")).toBeVisible();
  await shot(page, "fiche-membre");
  await page.keyboard.press("Escape");
  await go(page, "/crew");
  await page.getByTestId("crew-tab-spots").click();
  await expect(page.getByTestId("crew-spots")).toContainText("Pas de rendez-vous");
  await expect(page.getByTestId("crew-spots-soon")).toContainText("Disponible à la prochaine mise à jour");
  await expect(page.getByTestId("crew-spots-launch")).toBeVisible();
  // Discussion : la conversation du crew.
  await page.getByTestId("crew-tab-feed").click();
  await page.getByTestId("crew-discussion").click();
  await page.waitForURL(/boite\//, { timeout: 30_000 });
  await ctx.close();
});

test("un membre qui ouvre la page de son crew arrive dans l'onglet", async ({ browser }) => {
  test.setTimeout(120_000);
  const { ctx, page } = await open(browser, "kenji@orasso.local");
  await go(page, "/crew/roussillon-drift?onglet=sorties");
  await expect(page.getByTestId("crew-outings")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("crew-tabs")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/crew");
  await ctx.close();
});

test("sans crew : rejoindre ou créer ; vitrine d'un crew sans fil ni sorties ni photo", async ({ browser }) => {
  test.setTimeout(180_000);
  const { ctx, page } = await open(browser, "paul.photo@orasso.local");
  const seen: string[] = [];
  page.on("request", (r) => seen.push(r.url()));
  await go(page, "/crew");
  await expect(page.getByTestId("crew-tab-none")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("crew-tab-join")).toBeVisible();
  await expect(page.getByTestId("crew-tab-create")).toBeVisible();
  // Pas d'annuaire : une lettre ne cherche rien, deux lettres cherchent.
  await page.getByTestId("crew-tab-q").fill("R");
  await expect(page.getByTestId("crew-row")).toHaveCount(0);
  await page.getByTestId("crew-tab-q").fill("Rou");
  await expect(page.getByTestId("crew-row").first()).toBeVisible({ timeout: 30_000 });
  await shot(page, "sans-crew-recherche");
  // Vitrine : les membres, la demande ; ni fil, ni sorties, ni discussion, ni photo de crew.
  seen.length = 0;
  await go(page, "/crew/roussillon-drift");
  await expect(page.getByTestId("crew-vitrine")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("crew-request")).toBeVisible();
  for (const id of ["crew-feed", "crew-outings", "crew-tabs", "crew-discussion", "crew-tab-feed"]) {
    await expect(page.getByTestId(id), id).toHaveCount(0);
  }
  expect(seen.filter((u) => /\/crews\/[^/]+\/(photos|posts|outings)/.test(u))).toEqual([]);
  await ctx.close();
});
