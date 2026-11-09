import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7a2 (D38), côté appli (version web compilée de recette) : l'Accueil « tableau de bord » de Damien_66 pendant le
// « Rassemblement du Lydia » (ligne « En cours », bloc « En cours », « Voter », Mes sorties, Mon crew, Du nouveau chez tes
// potes), l'écran « Personnaliser » (grisés, monter, masquer, ajouter, remettre par défaut, enregistrer), puis le réglage
// relu sur l'Accueil. Lancer avec APP_URL (appli compilée), API seedée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7a2-captures/apres/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });
const DEFAULT = { order: [], hidden: ["agenda", "favorite_garage", "pending"] };

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 860 }, baseURL: APP });
  await ctx.addInitScript(() => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", "beton");
  });
  const page = await ctx.newPage();
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
  if (await page.getByTestId("whatsnew-dismiss").count()) await page.getByTestId("whatsnew-dismiss").click();
  return { ctx, page };
}

test("Accueil pendant l'événement, Personnaliser, ordre réglé, bloc masqué, remise par défaut", async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  const cookie = await login("damien@orasso.local");
  await apiCall(cookie, "PUT", "/me/home/widgets", DEFAULT);
  const requests: string[] = [];
  const { ctx, page } = await open(browser, "damien@orasso.local");
  page.on("request", (r) => {
    if (r.url().includes("/api/me/home")) requests.push(r.url());
  });
  await page.reload();
  await afterOpening(page);

  // Pendant l'événement : la ligne, le bloc « En cours », « Voter », puis les blocs dans l'ordre par défaut.
  await expect(page.getByTestId("home-live-line")).toContainText(/En cours · jour \d sur \d/i, { timeout: 30_000 });
  await expect(page.getByTestId("home-live-block")).toBeVisible();
  await expect(page.getByTestId("home-live-vote")).toBeVisible();
  await expect(page.getByTestId("home-my-outings")).toBeVisible();
  await expect(page.getByTestId("home-my-crew")).toBeVisible();
  await expect(page.getByTestId("home-friends-news")).toBeVisible();
  const y = async (id: string) => (await page.getByTestId(id).boundingBox())?.y ?? 0;
  expect(await y("home-my-outings")).toBeLessThan(await y("home-my-crew"));
  await page.screenshot({ path: `${DIR}/01-accueil-live.png`, fullPage: true });

  // Personnaliser : « Prochaine sortie » grisée en tête, « Défis de la saison » grisé « Bientôt ».
  await page.getByTestId("home-personalize").click();
  await expect(page.getByTestId("personalize-row-next_access")).toContainText("Toujours en tête");
  await expect(page.getByTestId("personalize-soon")).toContainText(/Bientôt/i);
  await expect(page.getByTestId("personalize-hidden")).toContainText("Garage favori");
  await page.screenshot({ path: `${DIR}/02-personnaliser.png`, fullPage: true });
  // Mon crew monte avant Mes sorties ; Du nouveau chez tes potes est masqué ; Agenda est ajouté.
  await page.getByTestId("personalize-up-my_crew").click();
  await page.getByTestId("personalize-hide-friends_news").click();
  await page.getByTestId("personalize-add-agenda").click();
  await expect(page.getByTestId("personalize-row-friends_news")).toContainText("Ajouter");
  await page.getByTestId("personalize-save").click();
  await page.waitForURL(/accueil/, { timeout: 30_000 });

  // Gardé sur le compte (serveur), relu par l'Accueil : ordre respecté, bloc masqué absent et non demandé.
  const saved = (await apiCall<{ widgets: { order: string[]; hidden: string[] } }>(cookie, "GET", "/me/home")).data
    .widgets;
  expect(saved.order.indexOf("my_crew")).toBeLessThan(saved.order.indexOf("my_outings"));
  expect(saved.hidden).toContain("friends_news");
  expect(saved.hidden).not.toContain("agenda");
  await expect(page.getByTestId("home-friends-news")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("home-my-crew")).toBeVisible();
  expect(await y("home-my-crew")).toBeLessThan(await y("home-my-outings"));
  const fresh = (await apiCall<{ friendsNews: unknown }>(cookie, "GET", "/me/home?persona=fan&blocks=app")).data;
  expect(fresh.friendsNews).toBeNull();
  await page.screenshot({ path: `${DIR}/03-accueil-regle.png`, fullPage: true });

  // Remettre par défaut, enregistrer.
  await page.getByTestId("home-personalize-bottom").click();
  await page.getByTestId("personalize-reset").click();
  await page.getByTestId("personalize-save").click();
  await page.waitForURL(/accueil/, { timeout: 30_000 });
  const reset = (await apiCall<{ widgets: { hidden: string[] } }>(cookie, "GET", "/me/home")).data.widgets;
  expect(reset.hidden).toEqual(["agenda", "favorite_garage", "pending"]);
  await expect(page.getByTestId("home-friends-news")).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});

test("hors événement : pas de ligne ni de bloc « En cours », Au spot et Souvenirs absents (vides)", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const { ctx, page } = await open(browser, "paul.photo@orasso.local");
  await expect(page.getByTestId("home-greeting")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("home-live-line")).toHaveCount(0);
  await expect(page.getByTestId("home-live-block")).toHaveCount(0);
  await expect(page.getByTestId("home-personalize")).toBeVisible();
  await page.screenshot({ path: `${DIR}/04-accueil-hors-evenement.png`, fullPage: true });
  await ctx.close();
});
