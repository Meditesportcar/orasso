import { expect, test } from "@playwright/test";
import { loginInBrowser, setTheme, unique } from "./helpers";
import { r5Crew } from "./lotr5c2-setup";
import { RELAIS } from "./relais";

// Lot R7b2 (D38), côté site : l'onglet Crew (`/app/crew`). Sélecteur avec deux crews (Théo, seed) et dernier ouvert mémorisé
// (cookie par compte) ; onglets Fil · Sorties · Membres · Spots (plus de Garage), voitures dans la fiche d'un membre, Spots
// = état vide, Discussion ; sans crew (Paul) ; `/app/crews` → 302 `/app/crew` ; `/c/:slug` : la vitrine d'un non-membre
// (sans fil ni sorties), le renvoi vers l'onglet d'un membre. API et site lancés sur la base seedée.
const DIR = process.env.CAPTURES_DIR2 ?? `${RELAIS}/lot-r7b2-captures/apres2`;
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
  // La page du crew renvoie le membre vers l'onglet ; l'ancien « Mes crews » aussi (302, temporaire).
  await page.goto("/c/roussillon-drift?onglet=membres");
  await page.waitForURL(/\/app\/crew\?crew=roussillon-drift&onglet=membres/);
  const res = await page.request.get("/app/crews", { maxRedirects: 0 });
  expect(res.status()).toBe(302);
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

test("tour 2 : Inviter dans la rangée Discussion, signaler, crew d'un lien qui n'est pas le mien", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const crew = await r5Crew(unique());
  const chef = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const cp = await chef.newPage();
  await setTheme(cp, "beton");
  await loginInBrowser(cp, crew.chef.email, undefined, `/app/crew?crew=${crew.slug}`);
  // Le chef : Discussion, Inviter (icône) et Réglages dans la même rangée ; pas de « Signaler » pour lui.
  await expect(cp.getByTestId("crew-invite")).toHaveAttribute("href", `/c/${crew.slug}/inviter`);
  await expect(cp.getByTestId("crew-invite")).toHaveAttribute("aria-label", "Inviter dans le crew");
  await expect(cp.getByTestId("crew-settings")).toBeVisible();
  await expect(cp.getByTestId("report-open")).toHaveCount(0);
  await cp.screenshot({ path: `${DIR}/site-discussion-chef-1280.png` });
  // Le crew d'un lien qui n'est pas le mien : sa vitrine, jamais un autre de mes crews en silence.
  await cp.goto("/app/crew?crew=roussillon-drift");
  await cp.waitForURL(/\/c\/roussillon-drift$/);
  await expect(cp.getByTestId("crew-vitrine")).toBeVisible();
  await chef.close();
  // Une membre qui n'est pas la cheffe peut signaler le crew depuis l'espace privé.
  const lea = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const lp = await lea.newPage();
  await loginInBrowser(lp, crew.lea.email, undefined, `/app/crew?crew=${crew.slug}`);
  await expect(lp.getByTestId("crew-tabs")).toBeVisible();
  await expect(lp.getByTestId("crew-invite")).toHaveCount(0);
  await lp.getByTestId("report-open").click();
  await expect(lp.getByTestId("report-dialog")).toBeVisible();
  await lea.close();
});

test("tour 2 : sans crew, les résultats de la recherche sur place", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await setTheme(page, "beton");
  await loginInBrowser(page, "paul.photo@orasso.local", undefined, "/app/crew");
  await expect(page.getByTestId("crew-tab-none")).toBeVisible();
  // Une lettre ne cherche rien ; deux lettres montrent les résultats sur place, avec leur bouton pour rejoindre.
  await page.getByTestId("crew-tab-q").fill("R");
  await page.getByTestId("crew-tab-search").click();
  await page.waitForURL(/\/app\/crew\?q=R$/);
  await expect(page.getByTestId("crew-tab-short")).toBeVisible();
  await expect(page.getByTestId("crew-row")).toHaveCount(0);
  await page.getByTestId("crew-tab-q").fill("Rou");
  await page.getByTestId("crew-tab-q").press("Enter");
  await page.waitForURL(/\/app\/crew\?q=Rou$/);
  await expect(page.getByTestId("crew-results")).toBeVisible();
  await expect(page.getByTestId("crew-row").first()).toBeVisible();
  await expect(page.getByTestId("crew-join").first()).toBeVisible();
  await expect(page.getByTestId("crew-tab-join")).toBeVisible();
  await page.screenshot({ path: `${DIR}/site-sans-crew-resultats-1280.png` });
  await ctx.close();
});
