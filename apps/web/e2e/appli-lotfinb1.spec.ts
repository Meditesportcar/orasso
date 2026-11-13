import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { SEED_PASSWORD } from "./helpers";
import { landscape, who } from "./lotr7f3-setup";
import { RELAIS } from "./relais";

// Petit lot de fin, partie B1, côté appli (version web compilée de recette, `APP_URL`) : le composeur de story ne publie jamais au
// nom d'un autre compte ni d'une page perdue. (1) Le compte change pendant la rédaction (le profil relu est celui d'un autre) :
// l'écran se verrouille, rien ne part. (2) L'envoi porte `expectedUserId` (le compte qui a ouvert l'écran) ; un 409
// `account_changed` verrouille l'écran, sans nouvel envoi. (3) `?auteur=` demande une page que le compte ne tient pas : jamais un
// repli silencieux sur « Moi » ni sur la casquette active ; « Publier en mon nom » est un choix explicite.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-fin-b1-captures/apres/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string, theme = "beton", scale = 1) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 860 }, baseURL: APP });
  await ctx.addInitScript(
    ([t, s]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t);
      if (Number(s) > 1) localStorage.setItem("orasso.recette.echellePolice", String(s));
    },
    [theme, scale] as const,
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

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

/** Ouvre l'écran, choisit la photo, passe « Ajuster », puis la plaque : « Aucune plaque visible » confirmée. */
async function toPlate(page: Page, path = "/story/publier") {
  await page.goto(path);
  await afterOpening(page);
  await expect(page.getByTestId("story-pick")).toBeVisible({ timeout: 30_000 });
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("story-pick-gallery").click();
  await (await chooser).setFiles(landscape());
  await expect(page.getByTestId("story-fit")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("story-fit-continue").click();
  await expect(page.getByTestId("story-plate")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("story-plate-none").click();
  await page.getByTestId("story-plate-none-yes").click();
}

async function validatePlate(page: Page) {
  await expect(page.getByTestId("story-plate-validate")).toBeEnabled();
  await page.getByTestId("story-plate-validate").click();
  await expect(page.getByTestId("story-details")).toBeVisible({ timeout: 30_000 });
}

const refresh = (page: Page) =>
  page.evaluate(() => (globalThis as { __orassoRefreshMe?: () => Promise<unknown> }).__orassoRefreshMe?.());

/** Relit le profil (ce que fait l'appli au retour au premier plan) alors que `/api/me` répond pour un autre compte. */
async function switchAccountUnderneath(page: Page, otherId: string) {
  await page.route(/\/api\/me$/, async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.user = { ...body.user, id: otherId };
    await route.fulfill({ response: res, json: body });
  });
  await refresh(page);
}

const OTHER = "00000000-0000-4000-8000-0000000000b1";

test("le compte change pendant la rédaction : l'écran se verrouille, rien n'est envoyé", async ({ browser }) => {
  test.setTimeout(300_000);
  const author = await who("StB1Compte");
  const { ctx, page } = await open(browser, author.email);
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/api\/me\/stories$/.test(r.url())) posts.push(r.url());
  });
  await toPlate(page);
  await validatePlate(page);
  await page.getByTestId("story-caption").fill("Brouillon du premier compte");
  await expect(page.getByTestId("story-stale")).toHaveCount(0);
  await switchAccountUnderneath(page, OTHER);
  await expect(page.getByTestId("story-stale")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("story-stale")).toContainText("Le compte connecté a changé");
  // Plus rien du brouillon : ni détails, ni bouton pour continuer ou publier.
  await expect(page.getByTestId("story-details")).toHaveCount(0);
  await expect(page.getByTestId("story-to-preview")).toHaveCount(0);
  await expect(page.getByTestId("story-publish")).toHaveCount(0);
  await shot(page, "01-compte-change-beton-384-x1");
  // Même si le premier compte revient, l'écran reste verrouillé (le brouillon était celui d'avant).
  await page.unroute(/\/api\/me$/);
  await refresh(page);
  await page.waitForTimeout(1_500);
  await expect(page.getByTestId("story-stale")).toBeVisible();
  expect(posts, "aucun envoi").toEqual([]);
  await ctx.close();
});

test("l'envoi porte le compte attendu ; un 409 account_changed verrouille l'écran, sans nouvel envoi", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const author = await who("StB1Envoi");

  // Le serveur répond 409 : l'écran se verrouille, une seule requête est partie (pas de reprise automatique).
  const refused = await open(browser, author.email);
  const bodies: Record<string, unknown>[] = [];
  await refused.page.route(/\/api\/me\/stories$/, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    bodies.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "account_changed", message: "La session n'est plus celle de ce brouillon." },
      }),
    });
  });
  await toPlate(refused.page);
  await validatePlate(refused.page);
  await refused.page.getByTestId("story-caption").fill("Envoi sous le bon compte");
  await refused.page.getByTestId("story-to-preview").click();
  await expect(refused.page.getByTestId("story-preview-canvas")).toBeVisible({ timeout: 30_000 });
  await refused.page.getByTestId("story-publish").click();
  await expect(refused.page.getByTestId("story-stale")).toBeVisible({ timeout: 30_000 });
  await refused.page.waitForTimeout(1_500);
  expect(bodies.length, "un seul envoi, aucune reprise après un 409").toBe(1);
  expect(bodies[0]?.expectedUserId, "le compte qui a ouvert l'écran").toBe(author.id);
  await shot(refused.page, "02-409-compte-change-beton-384-x1");
  await refused.ctx.close();

  // Le même parcours sous le bon compte : la story part, avec le même `expectedUserId`.
  const ok = await open(browser, author.email);
  const sent: Record<string, unknown>[] = [];
  await ok.page.route(/\/api\/me\/stories$/, async (route) => {
    if (route.request().method() === "POST") sent.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.continue();
  });
  await toPlate(ok.page);
  await validatePlate(ok.page);
  await ok.page.getByTestId("story-to-preview").click();
  await expect(ok.page.getByTestId("story-preview-canvas")).toBeVisible({ timeout: 30_000 });
  await ok.page.getByTestId("story-publish").click();
  await expect(ok.page.getByTestId("story-done")).toBeVisible({ timeout: 90_000 });
  expect(sent[0]?.expectedUserId).toBe(author.id);
  await ok.ctx.close();
});

test("une page demandée que le compte ne tient pas : l'envoi est bloqué, « Publier en mon nom » est un choix explicite", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const author = await who("StB1Page");
  const { ctx, page } = await open(browser, author.email);
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/api\/me\/stories$/.test(r.url())) posts.push(r.url());
  });
  // Une structure qui n'est pas au compte (clé `s:`) : ni « Moi », ni la casquette active ne la remplacent.
  await toPlate(page, "/story/publier?auteur=s%3A11111111-1111-4111-8111-111111111111");
  await expect(page.getByTestId("story-author-lost")).toBeVisible();
  await expect(page.getByTestId("story-author-lost")).toContainText("Tu n'as plus accès à cette page");
  await expect(page.getByTestId("story-plate-validate")).toBeDisabled();
  // Aucune autre casquette n'est proposée : pas de « en tant que … » (l'en-tête est neutre).
  await expect(page.getByText(/en tant que/i)).toHaveCount(0);
  await shot(page, "03-page-perdue-beton-384-x1");
  // Le choix explicite : la story est alors celle de la personne.
  await page.getByTestId("story-author-lost-me").click();
  await expect(page.getByTestId("story-author-lost")).toHaveCount(0);
  await validatePlate(page);
  expect(posts, "rien n'est parti avant le choix").toEqual([]);
  await ctx.close();
});

test("page perdue à l'ouverture sous une casquette active : l'écran ne garde pas la casquette active", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { ctx, page } = await open(browser, "damien@orasso.local");
  // Damien porte la casquette de MéditeSportCar (Profil → « Changer de casquette »).
  await page.goto("/moi");
  await afterOpening(page);
  await page.getByTestId("casquette-organizer").filter({ hasText: "MéditeSportCar" }).first().click();
  await page.waitForURL((u) => !/\/(moi|profil)(\?|$)/.test(u.pathname), { timeout: 30_000 });
  await expect(page.getByTestId("persona-tabbar")).toBeVisible({ timeout: 30_000 });
  const LOST = "s%3A11111111-1111-4111-8111-111111111111";
  await page.goto(`/story/publier?auteur=${LOST}`);
  await afterOpening(page);
  await expect(page.getByTestId("story-author-lost")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("story-author-lost")).toContainText("Tu n'as plus accès à cette page");
  // Ni « en tant que MéditeSportCar » en en-tête, ni lien « Publication » vers la casquette active.
  await expect(page.getByText(/en tant que/i)).toHaveCount(0);
  await expect(page.getByText("MéditeSportCar")).toHaveCount(0);
  await page.getByTestId("story-publish-kind").getByText("Publication", { exact: true }).click();
  await page.waitForURL(/\/fil\/publier/, { timeout: 30_000 });
  const asked = new URL(page.url()).searchParams.get("auteur");
  expect(asked, "le lien garde la page demandée").toBe(decodeURIComponent(LOST));
  await shot(page, "04-page-perdue-casquette-active-beton-384-x1");
  await ctx.close();
});
