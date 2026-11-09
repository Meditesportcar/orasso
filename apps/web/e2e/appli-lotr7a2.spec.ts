import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { addPendingSecondPlace, apiCall, login, SEED_PASSWORD, sidelineOtherEvents } from "./helpers";
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
  const dismiss = page.getByTestId("whatsnew-dismiss");
  // Le bandeau « Du nouveau » (compte jamais ouvert) peut ne pas être cliquable : on le range si on peut, sinon on passe.
  await dismiss.click({ timeout: 4_000 }).catch(() => undefined);
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

// --- Tour 3 -------------------------------------------------------------------------------------------------------------
test("tour 3 : participant sans droit de vote : pas de « Voter », « Mon accès » en bouton principal", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  mkdirSync(DIR, { recursive: true });
  // Le Salon Argelès du seed, en cours lui aussi, passerait devant : Pilote_007 ne vit ici que le Rassemblement du Lydia.
  const restore = await sidelineOtherEvents("Pilote_007");
  try {
    const cookie = await login("pilote7@orasso.local");
    const home = (
      await apiCall<{ live: { hasPlace: boolean; votes: { canVote: boolean } } | null }>(cookie, "GET", "/me/home")
    ).data;
    expect(home.live?.hasPlace).toBe(true);
    expect(home.live?.votes.canVote).toBe(false);
    const { ctx, page } = await open(browser, "pilote7@orasso.local");
    // Retenu et pas encore entré, le jour J : l'appli ouvre d'elle-même l'écran du QR ; on le ferme pour revenir à l'Accueil.
    if (/jour-j/.test(page.url())) await page.mouse.click(349, 31);
    await expect(page.getByTestId("home-live-line")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("home-live-vote")).toHaveCount(0);
    await expect(page.getByTestId("home-live-access")).toBeVisible();
    await page.screenshot({ path: `${DIR}/05-sans-droit-de-vote.png`, fullPage: true });
    await ctx.close();
  } finally {
    await restore();
  }
});

test("tour 3 : Personnaliser avec /me/settings lent puis en erreur 500 : Enregistrer éteint, puis Réessayer", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  mkdirSync(DIR, { recursive: true });
  const { ctx, page } = await open(browser, "damien@orasso.local");
  let broken = true;
  await page.route("**/api/me/settings", async (route) => {
    if (!broken || route.request().method() !== "GET") return route.continue();
    await new Promise((r) => setTimeout(r, 4_000));
    return route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"boom"}' });
  });
  await page.getByTestId("home-personalize").click();
  // Lent : « Enregistrer » éteint, aucun bloc présenté.
  await expect(page.getByTestId("personalize-loading")).toBeVisible();
  await expect(page.getByTestId("personalize-save")).toBeDisabled();
  await expect(page.getByTestId("personalize-list")).toHaveCount(0);
  // Erreur 500 : le message et « Réessayer », « Enregistrer » toujours éteint.
  await expect(page.getByTestId("personalize-load-failed")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("personalize-save")).toBeDisabled();
  await expect(page.getByTestId("personalize-list")).toHaveCount(0);
  await expect(page.getByTestId("personalize-retry")).toBeVisible();
  await page.screenshot({ path: `${DIR}/06-personnaliser-echec.png`, fullPage: true });
  broken = false;
  await page.getByTestId("personalize-retry").click();
  await expect(page.getByTestId("personalize-list")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("personalize-save")).toBeEnabled();
  await ctx.close();
});

test("tour 3 : une ligne à deux véhicules de statuts différents, et Réinitialiser aux défauts du compte", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  mkdirSync(DIR, { recursive: true });
  const cookie = await login("damien@orasso.local");
  const remove = await addPendingSecondPlace();
  try {
    expect(remove).not.toBeNull();
    const { ctx, page } = await open(browser, "damien@orasso.local");
    const line = page.getByTestId("home-my-outing").filter({ hasText: "Rassemblement du Lydia" });
    await expect(line).toBeVisible({ timeout: 30_000 });
    // La ligne est « Retenue » ; le véhicule encore en attente le dit, l'autre non.
    const detail = line.getByTestId("home-my-outing-detail");
    await expect(detail).toContainText("(en attente)");
    expect((await detail.innerText()).split(" · ").filter((x) => x.includes("(en attente)"))).toHaveLength(1);
    await line.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${DIR}/07-mes-sorties-deux-vehicules.png`, fullPage: true });

    // Réinitialiser = défauts du compte, calculés par l'API (réglage effacé).
    await apiCall(cookie, "PUT", "/me/home/widgets", {
      order: ["next_access", "weather"],
      hidden: ["friends_news", "agenda"],
    });
    await page.getByTestId("home-personalize-bottom").click();
    await expect(page.getByTestId("personalize-row-friends_news")).toContainText("Ajouter", { timeout: 30_000 });
    await page.getByTestId("personalize-reset").click();
    await expect(page.getByTestId("personalize-row-friends_news")).not.toContainText("Ajouter", { timeout: 30_000 });
    const after = (await apiCall<{ homeWidgets: { hidden: string[] } | null }>(cookie, "GET", "/me/settings")).data;
    expect(after.homeWidgets).toBeNull();
    await ctx.close();
  } finally {
    await remove?.();
    await apiCall(cookie, "PUT", "/me/home/widgets", DEFAULT);
  }
});
