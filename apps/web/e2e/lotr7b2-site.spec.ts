import { expect, test } from "@playwright/test";
import { loginInBrowser, setTheme } from "./helpers";

// Lot R7b2 (D38), côté site : l'onglet Crew (`/app/crew`). Sélecteur avec deux crews (Théo, seed) et dernier ouvert mémorisé
// (cookie par compte) ; onglets Fil · Sorties · Membres · Spots (plus de Garage), voitures dans la fiche d'un membre, Spots
// = état vide, Discussion ; sans crew (Paul) ; `/app/crews` → 301 `/app/crew` ; `/c/:slug` : la vitrine d'un non-membre
// (sans fil ni sorties), le renvoi vers l'onglet d'un membre. API et site lancés sur la base seedée.
test.use({ viewport: { width: 1280, height: 900 } });

test("sélecteur à deux crews, dernier ouvert mémorisé", async ({ page }) => {
  test.setTimeout(120_000);
  await setTheme(page, "beton");
  await loginInBrowser(page, "theo@orasso.local", undefined, "/app/crew");
  await expect(page.getByTestId("crew-selector")).toBeVisible();
  await page.getByTestId("crew-selector").click();
  await expect(page.getByTestId("crew-selector-list")).toBeVisible();
  await page.getByTestId("crew-choice-cote-vermeille-classic").click();
  await page.waitForURL(/crew=cote-vermeille-classic/);
  await expect(page.getByTestId("crew-selector")).toContainText("Côte Vermeille Classic");
  // Sans paramètre : le dernier ouvert revient.
  await page.goto("/app/crew");
  await expect(page.getByTestId("crew-selector")).toContainText("Côte Vermeille Classic");
});

test("un crew : onglets, Discussion, voitures du membre, Spots", async ({ page }) => {
  test.setTimeout(120_000);
  await setTheme(page, "beton");
  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/crew");
  await expect(page.getByTestId("crew-tabs")).toBeVisible();
  await expect(page.getByTestId("crew-selector")).toHaveCount(0);
  await expect(page.getByTestId("crew-tab-fil")).toBeVisible();
  await expect(page.getByTestId("crew-tab-membres")).toBeVisible();
  await expect(page.getByTestId("crew-tab-spots")).toBeVisible();
  await expect(page.getByTestId("crew-tab-garage")).toHaveCount(0);
  await expect(page.getByTestId("crew-feed")).toBeVisible();
  await expect(page.getByTestId("crew-outings")).toBeVisible();
  await expect(page.getByTestId("crew-discussion")).toHaveAttribute("href", /\/app\/boite\//);
  await page.getByTestId("crew-tab-membres").click();
  await expect(page.getByTestId("crew-members")).toBeVisible();
  await page.getByTestId("crew-member-open").first().click();
  await expect(page.getByTestId("crew-member-sheet").first()).toBeVisible();
  await expect(page.getByTestId("crew-member-profile").first()).toBeVisible();
  await page.getByTestId("crew-tab-spots").click();
  await expect(page.getByTestId("crew-spots")).toContainText("Pas de rendez-vous");
  await expect(page.getByTestId("crew-spots-soon")).toContainText("Disponible à la prochaine mise à jour");
  await expect(page.getByTestId("crew-spots-launch")).toBeDisabled();
  // La page du crew renvoie le membre vers l'onglet ; l'ancien « Mes crews » aussi (301).
  await page.goto("/c/roussillon-drift?onglet=membres");
  await page.waitForURL(/\/app\/crew\?crew=roussillon-drift&onglet=membres/);
  const res = await page.request.get("/app/crews", { maxRedirects: 0 });
  expect(res.status()).toBe(301);
  expect(res.headers().location).toContain("/app/crew");
});

test("sans crew, et la vitrine d'un non-membre", async ({ page }) => {
  test.setTimeout(120_000);
  await setTheme(page, "beton");
  await loginInBrowser(page, "paul.photo@orasso.local", undefined, "/app/crew");
  await expect(page.getByTestId("crew-tab-none")).toBeVisible();
  await expect(page.getByTestId("crew-tab-join")).toBeVisible();
  await expect(page.getByTestId("crew-tab-create")).toHaveAttribute("href", "/app/crews/nouveau");
  await page.getByTestId("crew-tab-q").fill("Rou");
  await page.getByTestId("crew-tab-join").click();
  await page.waitForURL(/crews\/rejoindre\?q=Rou/);
  await page.goto("/app/crews/nouveau");
  await expect(page.getByTestId("crew-create-form")).toBeVisible();
  await page.goto("/c/roussillon-drift");
  await expect(page.getByTestId("crew-vitrine")).toBeVisible();
  for (const id of ["crew-feed", "crew-outings", "crew-tabs", "crew-discussion"]) {
    await expect(page.getByTestId(id), id).toHaveCount(0);
  }
  await expect(page.locator('img[src*="/photos/"]')).toHaveCount(0);
});

