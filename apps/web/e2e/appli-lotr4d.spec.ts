import { mkdirSync } from "node:fs";
import { type Browser, expect, type Locator, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { MOBILE, SEED_PASSWORD } from "./helpers";
import { RELAIS } from "./relais";

// Lot R4d (maquette R4.2 validée par Damien le 24/10), côté appli (version web compilée) : dans « Où chercher ? » ›
// Ailleurs, plus de grille de 101 vignettes mais la recherche sans accents et sa liste déroulante (5 au plus), les 3
// derniers départements choisis (gardés avec le choix de l'Explorer, par compte) et la carte de « Ton coin » (toucher
// un département le choisit). Le bouton dit le résultat. Béton et Sable, 390 px.
// Lancer avec APP_URL (appli compilée : `node scripts/appli-compilee.mjs`), API seedée (Kenji, coin 66).
// Le premier test (« Ailleurs ouvert ») marche aussi sur le code d'avant le lot : il sert aux captures « avant ».
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r4d-captures/appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

type Theme = "beton" | "sable";
const THEMES: Theme[] = ["beton", "sable"];

async function open(browser: Browser, theme: Theme) {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  return { ctx, page };
}

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function signIn(page: Page, email: string) {
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 30_000 });
}

async function goto(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

async function dismissAsk(page: Page) {
  const later = page.getByText("Plus tard", { exact: true });
  if (await later.isVisible().catch(() => false)) await later.click();
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

/**
 * Pas de contrôle des mots coupés : sous la feuille, la liste de l'Explorer porte des titres d'essai à identifiant de 9
 * lettres sans espace que l'affiche Minimal coupe forcément (même choix que la recette du lot R3b).
 */
async function audit(page: Page) {
  const a = await auditPage(page);
  expect(a.greens).toEqual([]);
  expect(a.horizontalScroll).toBe(false);
  expect(a.truncated).toEqual([]);
  expect(a.primaryButtons).toBeLessThanOrEqual(1);
}

async function openAway(page: Page, pill = "around-open", sheet = "around-sheet", away = "around-elsewhere") {
  await page.getByTestId(pill).click();
  await expect(page.getByTestId(sheet)).toBeVisible();
  await page.getByTestId(away).click();
}

async function apply(page: Page) {
  await page.getByTestId("where-apply").click();
  await expect(page.getByTestId("around-sheet")).toHaveCount(0);
}

const results = (page: Page): Locator => page.locator('[data-testid^="around-result-"]');
const recents = (page: Page): Locator => page.locator('[data-testid^="around-recent-"]');
const codes = async (list: Locator) =>
  (await list.evaluateAll((els) => els.map((e) => e.getAttribute("data-testid") ?? ""))).map((id) =>
    id.replace(/^around-(result|recent)-/, ""),
  );

test("R4d appli : « Ailleurs » ouvert (captures avant / après)", async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  for (const theme of THEMES) {
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "kenji@orasso.local");
    await goto(page, "/explorer");
    await dismissAsk(page);
    await openAway(page);
    await shot(page, `01-ailleurs-${theme}`);
    await ctx.close();
  }
});

test("R4d appli : recherche, carte, récents par compte, bouton qui dit le résultat", async ({ browser }) => {
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  const errors: string[] = [];
  for (const theme of THEMES) {
    const { ctx, page } = await open(browser, theme);
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text().slice(0, 200));
    });
    await signIn(page, "kenji@orasso.local");
    await goto(page, "/explorer");
    await dismissAsk(page);
    await openAway(page);

    // Plus de grille : la recherche et la carte ; aucun récent sur un appareil neuf ; rien de choisi, rien à voir.
    await expect(page.getByTestId("around-find")).toBeVisible();
    await expect(page.getByTestId("around-map").locator("path")).toHaveCount(96);
    await expect(page.getByTestId("around-recent")).toHaveCount(0);
    await expect(page.getByTestId("where-apply")).toBeDisabled();

    // « her » trouve Hérault, pas Cher ; « PYRÉNÉES » sans accents ni majuscules ; 5 au plus ; rien trouvé.
    const find = page.getByTestId("around-find");
    await find.fill("her");
    expect(await codes(results(page))).toEqual(["34"]);
    await audit(page);
    await shot(page, `02-recherche-her-${theme}`);
    await find.fill("PYRÉNÉES");
    await expect(results(page)).toHaveCount(3);
    expect(await codes(results(page))).toEqual(["64", "66", "65"]);
    await find.fill("cote d'or");
    expect(await codes(results(page))).toEqual(["21"]);
    await find.fill("2a");
    expect(await codes(results(page))).toEqual(["2A"]);
    await find.fill("1");
    await expect(results(page)).toHaveCount(5);
    await expect(page.getByTestId("around-results")).toContainText("autres : continue à taper");
    await find.fill("zzz");
    await expect(page.getByTestId("around-none")).toContainText("« zzz »");
    await page.getByTestId("around-find-clear").click();
    await expect(page.getByTestId("around-results")).toHaveCount(0);

    // La carte : toucher l'Aude la choisit ; le bouton dit le résultat (« Voir les N événements », « Aucun… »).
    await page.getByTestId("around-map").locator('[data-testid="dept-11"]').click();
    await expect(page.getByTestId("around-elsewhere")).toContainText("Choisi : Aude (11)");
    await expect(page.getByTestId("around-elsewhere")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("where-apply")).toHaveText(/Voir l|Aucun événement ici/, { timeout: 20_000 });
    await shot(page, `03-carte-aude-${theme}`);
    // Le 66 (Pyrénées-Orientales) a des événements dans le seed : le bouton les compte.
    await page.getByTestId("around-find").fill("66");
    await page.getByTestId("around-result-66").click();
    await expect(page.getByTestId("where-apply")).toHaveText(/Voir (l'événement|les \d+ événements)/, {
      timeout: 20_000,
    });
    await page.getByTestId("around-map").locator('[data-testid="dept-11"]').click();
    await apply(page);
    await expect(page.getByTestId("around-open")).toContainText("(11)");

    // Les récents : l'Aude ; l'Hérault en tête ensuite ; Mon coin n'y entre pas ; 3 au plus, sans doublon.
    await openAway(page);
    expect(await codes(recents(page))).toEqual(["11"]);
    await page.getByTestId("around-find").fill("34");
    await page.getByTestId("around-result-34").click();
    await apply(page);
    await openAway(page);
    expect(await codes(recents(page))).toEqual(["34", "11"]);
    await page.getByTestId("around-mine").click();
    await apply(page);
    await openAway(page);
    expect(await codes(recents(page))).toEqual(["34", "11"]);
    await page.getByTestId("around-find").fill("gironde");
    await page.getByTestId("around-result-33").click();
    await apply(page);
    await openAway(page);
    await page.getByTestId("around-find").fill("var");
    await page.getByTestId("around-result-83").click();
    await apply(page);
    await openAway(page);
    expect(await codes(recents(page))).toEqual(["83", "33", "34"]);
    // Un récent se choisit d'un toucher.
    await page.getByTestId("around-recent-34").getByRole("radio").click();
    await expect(page.getByTestId("around-elsewhere")).toContainText("(34)");
    await audit(page);
    await shot(page, `04-recents-${theme}`);
    await apply(page);
    await expect(page.getByTestId("around-open")).toContainText("(34)");

    // Gardés après un redémarrage (avec le choix de l'Explorer, sur ce compte).
    await goto(page, "/explorer");
    await dismissAsk(page);
    await openAway(page);
    expect(await codes(recents(page))).toEqual(["34", "83", "33"]);
    await page.getByTestId("sheet-close").click();

    // Personnes et crews : le même « Ailleurs », les mêmes récents ; un choix les met à jour.
    await page.getByTestId("segment-personnes").click();
    await openAway(page, "people-where-open", "people-where-sheet", "people-where-elsewhere");
    expect(await codes(recents(page))).toEqual(["34", "83", "33"]);
    await shot(page, `05-personnes-ailleurs-${theme}`);
    await page.getByTestId("around-find").fill("aude");
    await page.getByTestId("around-result-11").click();
    await expect(page.getByTestId("people-where-open")).toContainText("(11)");
    await page.getByTestId("segment-evenements").click();
    await openAway(page);
    expect(await codes(recents(page))).toEqual(["11", "34", "83"]);
    await ctx.close();
  }
  expect(errors.filter((e) => !/Failed to load resource|favicon/i.test(e))).toEqual([]);
});
