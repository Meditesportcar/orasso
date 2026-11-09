import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, SEED_PASSWORD, unique } from "./helpers";
import { type R5Crew, r5Crew } from "./lotr5c2-setup";
import { postText, removeMember } from "./lotr6a-setup";
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

async function open(browser: Browser, email: string, theme = "beton", size: { height?: number; scale?: number } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: size.height ?? 860 }, baseURL: APP });
  await ctx.addInitScript(
    ([t, scale]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t);
      if (Number(scale) > 1) localStorage.setItem("orasso.recette.echellePolice", String(scale));
    },
    [theme, size.scale ?? 1] as const,
  );
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

test("un crew : Fil · Sorties · Membres · Spots, Discussion, voitures dans la fiche d'un membre", async ({
  browser,
}) => {
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

/** Un crew de recette dont le chef en a un second (le sélecteur), et un fil bien plus long que l'écran. */
async function longFeedCrews(posts = 10) {
  const crew = await r5Crew(unique());
  const tag = crew.slug.slice(-6);
  const created = await apiCall<{ id: string; slug: string }>(crew.chef.cookie, "POST", "/crews", {
    name: `Second ${tag}`,
    description: "Le second crew du chef, pour le sélecteur.",
    department: "66",
  });
  expect(created.status).toBe(201);
  for (let i = 1; i <= posts; i += 1) {
    await postText(
      crew,
      crew.chef,
      `Publication n° ${i} : rendez-vous au parking de la cave coopérative de Thuir à 9 h.`,
    );
  }
  return { crew, second: { ...created.data, name: `Second ${tag}` } };
}

/** La zone qui défile de l'onglet Crew : tout en haut (0) ou tout en bas ("bas"). */
async function scrollTab(page: Page, to: 0 | "bas") {
  await page.getByTestId("crew-tab").evaluate((el, y) => {
    el.scrollTop = y === "bas" ? el.scrollHeight : 0;
  }, to);
  await page.waitForTimeout(400);
}

/** La feuille est dans la zone des feuilles de l'écran, pas dans la zone qui défile (où elle se caserait en bas du contenu). */
async function expectOutsideScroller(page: Page, testId: string) {
  await expect(page.getByTestId(testId)).toBeVisible();
  await expect(page.locator(`[data-testid="crew-tab"] [data-testid="${testId}"]`)).toHaveCount(0);
}

/** Sur un fil long, tout en haut : « Mes crews », l'invitation et la fiche d'un membre couvrent l'écran (Overlay). */
async function openSheets(page: Page, crew: R5Crew, suffix: string, capture = false) {
  await expect(page.getByTestId("crew-post").first()).toBeVisible({ timeout: 30_000 });
  const tall = await page.getByTestId("crew-tab").evaluate((el) => el.scrollHeight / el.clientHeight);
  expect(tall, "le fil est bien plus long que l'écran").toBeGreaterThan(1.8);
  await scrollTab(page, 0);
  await page.getByTestId("crew-selector").click();
  await expect(page.getByTestId("crew-selector-list")).toBeInViewport({ ratio: 0.9 });
  await expectOutsideScroller(page, "crew-selector-list");
  if (capture) await shot(page, `selecteur-${suffix}`);
  await page.getByTestId("crew-choice-more").waitFor();
  await page.mouse.click(190, 40);
  await expect(page.getByTestId("crew-selector-list")).toHaveCount(0);
  // L'invitation (le chef).
  await page.getByTestId("crew-invite").click();
  await expect(page.getByTestId("crew-invite-sheet")).toBeInViewport({ ratio: 0.9 });
  await expectOutsideScroller(page, "crew-invite-sheet");
  if (capture) await shot(page, `invitation-${suffix}`);
  await page.mouse.click(190, 40);
  await expect(page.getByTestId("crew-invite-sheet")).toHaveCount(0);
  // La fiche d'un membre.
  await page.getByTestId("crew-tab-members").click();
  await scrollTab(page, 0);
  await page.getByTestId("crew-member").first().click();
  await expect(page.getByTestId("crew-member-sheet")).toBeInViewport({ ratio: 0.9 });
  await expect(page.getByTestId("crew-member-profile")).toBeInViewport();
  await expectOutsideScroller(page, "crew-member-sheet");
  if (capture) await shot(page, `fiche-membre-${suffix}`);
  await page.mouse.click(190, 40);
  await expect(page.getByTestId("crew-member-sheet")).toHaveCount(0);
  void crew;
}

test("tour 2 : les feuilles couvrent l'écran, même sur un fil long", async ({ browser }) => {
  test.setTimeout(300_000);
  const { crew } = await longFeedCrews();
  const { ctx, page } = await open(browser, crew.chef.email, "beton", { height: 560 });
  await go(page, `/crew?crew=${crew.slug}`);
  await openSheets(page, crew, "beton-384-x1");
  await ctx.close();
});

/** Navigation interne, sans recharger l'appli : l'historique du navigateur, comme un lien ouvert depuis l'appli. */
async function navigateInApp(page: Page, path: string) {
  await page.evaluate((p) => {
    window.history.pushState({}, "", p);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
  await page.waitForTimeout(1_200);
}

test("tour 2 : un lien reçu alors que l'onglet est déjà monté l'emporte, et un même lien relu agit encore", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { crew, second } = await longFeedCrews(1);
  const { ctx, page } = await open(browser, crew.chef.email);
  await go(page, `/crew?crew=${second.slug}`);
  const selector = page.getByTestId("crew-selector");
  await expect(selector).toContainText(second.name, { timeout: 30_000 });
  await page.evaluate(() => {
    (window as unknown as { __sansRechargement: boolean }).__sansRechargement = true;
  });
  // Notification du crew A pendant que B est affiché : A. Les paramètres sont retirés.
  await navigateInApp(page, `/crew?crew=${crew.slug}`);
  await expect(selector).toContainText(crew.name, { timeout: 15_000 });
  await expect.poll(() => new URL(page.url()).search).toBe("");
  // Choix manuel de B, puis le même lien relu : A de nouveau (il l'emporte sur le choix manuel).
  await selector.click();
  await page.getByTestId(`crew-choice-${second.slug}`).click();
  await expect(selector).toContainText(second.name, { timeout: 15_000 });
  await navigateInApp(page, `/crew?crew=${crew.slug}`);
  await expect(selector).toContainText(crew.name, { timeout: 15_000 });
  // Un onglet demandé alors que le crew est déjà affiché.
  await navigateInApp(page, "/crew?onglet=sorties");
  await expect(page.getByTestId("crew-outings")).toBeVisible({ timeout: 15_000 });
  await navigateInApp(page, "/crew?onglet=membres");
  await expect(page.getByTestId("crew-members")).toBeVisible({ timeout: 15_000 });
  await navigateInApp(page, `/crew?crew=${second.slug}&onglet=sorties`);
  await expect(selector).toContainText(second.name, { timeout: 15_000 });
  await expect(page.getByTestId("crew-outings")).toBeVisible();
  // Un crew créé à l'instant (la liste en mémoire ne le connaît pas encore) : le nouveau s'affiche.
  const made = await apiCall<{ id: string; slug: string }>(crew.chef.cookie, "POST", "/crews", {
    name: `Neuf ${crew.slug.slice(-6)}`,
    description: "Créé pendant que l'onglet est ouvert.",
    department: "66",
  });
  expect(made.status).toBe(201);
  await navigateInApp(page, `/crew?crew=${made.data.slug}`);
  await expect(selector).toContainText(`Neuf ${crew.slug.slice(-6)}`, { timeout: 20_000 });
  // Le crew d'un lien qui n'est pas le mien : sa vitrine, pas un autre de mes crews en silence.
  await navigateInApp(page, "/crew?crew=roussillon-drift");
  await expect(page.getByTestId("crew-vitrine")).toBeVisible({ timeout: 20_000 });
  expect(new URL(page.url()).pathname).toBe("/crew/roussillon-drift");
  expect(await page.evaluate(() => (window as unknown as { __sansRechargement?: boolean }).__sansRechargement)).toBe(
    true,
  );
  await ctx.close();
});

test("tour 2 : signaler son crew depuis l'espace privé, sauf le chef", async ({ browser }) => {
  test.setTimeout(240_000);
  const crew: R5Crew = await r5Crew(unique());
  const lea = await open(browser, crew.lea.email);
  await go(lea.page, `/crew?crew=${crew.slug}`);
  await expect(lea.page.getByTestId("crew-tabs")).toBeVisible({ timeout: 30_000 });
  await expect(lea.page.getByTestId("report-open-crew")).toBeVisible();
  await lea.ctx.close();
  const chef = await open(browser, crew.chef.email);
  await go(chef.page, `/crew?crew=${crew.slug}`);
  await expect(chef.page.getByTestId("crew-tabs")).toBeVisible({ timeout: 30_000 });
  await expect(chef.page.getByTestId("report-open-crew")).toHaveCount(0);
  await chef.ctx.close();
});

for (const retour of ["le bouton Réessayer", "le retour du réseau"] as const) {
  test(`tour 2 : retiré du crew puis panne, un échec avec reprise (${retour})`, async ({ browser }) => {
    test.setTimeout(240_000);
    const crew: R5Crew = await r5Crew(unique());
    const { ctx, page } = await open(browser, crew.lea.email);
    await go(page, `/crew?crew=${crew.slug}`);
    await expect(page.getByTestId("crew-tabs")).toBeVisible({ timeout: 30_000 });
    // La liste de mes crews ne répond plus, puis la cheffe retire Léa : le crew n'est plus le sien.
    await page.route("**/api/me/crews", (route) => route.abort("failed"));
    await removeMember(crew, crew.lea);
    const failed = page.getByTestId("crew-tab").getByTestId("load-error");
    await expect(failed).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText("Chargement…")).toHaveCount(0);
    await shot(page, `perte-puis-panne-${retour.includes("bouton") ? "bouton" : "reseau"}`);
    if (retour.includes("bouton")) {
      await page.unroute("**/api/me/crews");
      await failed.getByRole("button", { name: "Réessayer" }).click();
    } else {
      await ctx.setOffline(true);
      await page.unroute("**/api/me/crews");
      await page.waitForTimeout(500);
      await ctx.setOffline(false);
    }
    await expect(page.getByTestId("crew-tab-none")).toBeVisible({ timeout: 25_000 });
    await ctx.close();
  });
}

test("tour 2 : captures des feuilles sur un fil long (Béton et Sable, 384 px, police 1 et 1,3)", async ({
  browser,
}) => {
  test.setTimeout(900_000);
  const { crew } = await longFeedCrews(12);
  for (const theme of ["beton", "sable"] as const) {
    for (const scale of [1, 1.3]) {
      const { ctx, page } = await open(browser, crew.chef.email, theme, { height: 844, scale });
      await go(page, `/crew?crew=${crew.slug}`);
      await openSheets(page, crew, `384-x${scale}-${theme}`, true);
      await ctx.close();
    }
  }
});
