import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD } from "./helpers";
import { sql } from "./lotr7f2-setup";
import { RELAIS } from "./relais";

// Lot R8s (D40), côté appli (version web compilée de recette, `APP_URL`) : la lecture enchaînée des stories. Ouvrir le premier auteur
// non vu depuis la barre → aller au bout → l'auteur suivant s'ouvre seul → après le dernier non vu la visionneuse se ferme, on est
// sur le Fil et les anneaux sont éteints ; les boutons « Auteur précédent » et « Auteur suivant » ; le glissement à gauche et à
// droite ; une story ouverte depuis un profil se ferme à la fin de l'auteur. Le plantage des barres de progression (largeur lue
// dans la mise à jour d'état) n'existe pas sur le web : sa règle est testée à part (`trackLayout.test.ts`) et se vérifie sur le téléphone.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r8s-captures/apres/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

type BarAuthor = { key: string; pseudoOrName: string; hasUnseen: boolean };

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, theme = "beton", width = 384) {
  const ctx = await browser.newContext({ viewport: { width, height: 860 }, baseURL: APP });
  await ctx.addInitScript(
    ([t]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t);
    },
    [theme] as const,
  );
  const page = await ctx.newPage();
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill("damien@orasso.local");
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
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function resetViews() {
  await sql("delete from story_views");
  await sql("update stories set views_count = 0");
}

/** La barre de Damien telle que l'API la sert (ordre du serveur). */
async function bar(): Promise<BarAuthor[]> {
  const cookie = await login("damien@orasso.local");
  return (await apiCall<{ authors: BarAuthor[] }>(cookie, "GET", "/stories/bar")).data.authors;
}

const currentFill = async (page: Page) =>
  (await page.getByTestId("story-bar-current").locator("> *").first().boundingBox())?.width ?? 0;
const playing = (page: Page) => expect.poll(() => currentFill(page), { timeout: 30_000 }).toBeGreaterThan(1);
const author = (page: Page) => page.getByTestId("story-author");

async function openFrom(page: Page, name: string) {
  await go(page, "/fil");
  await expect(page.getByTestId("stories-bar")).toBeVisible({ timeout: 30_000 });
  await page.getByLabel(new RegExp(`Voir les stories de ${name}`)).click();
  await expect(page.getByTestId("story-viewer")).toBeVisible({ timeout: 30_000 });
  await playing(page);
}

/** Lit toutes les stories de l'auteur affiché (touchers à droite) jusqu'au changement d'auteur ou la fermeture. */
async function readToTheEnd(page: Page, name: string) {
  for (let i = 0; i < 12; i++) {
    const changed = await author(page)
      .textContent({ timeout: 3_000 })
      .then((t) => t !== name)
      .catch(() => true);
    if (changed) return;
    await playing(page);
    await page.getByTestId("story-surface").click({ position: { x: 360, y: 400 } });
    await page.waitForTimeout(250);
  }
}

test("barre dans l'ordre du serveur, lecture enchaînée jusqu'au dernier non vu, fermeture, anneaux éteints", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  await resetViews();
  const authors = await bar();
  const unseen = authors.filter((a) => a.hasUnseen);
  expect(unseen.length).toBeGreaterThanOrEqual(3);
  // Rang 2 : l'organisateur de l'événement en cours (le Lydia) ouvre la barre ; les non vus précèdent les vus.
  expect(authors[0]?.pseudoOrName).toBe("Roues Libres 66");
  expect(authors.findIndex((a) => !a.hasUnseen)).toBe(-1);
  const { ctx, page } = await open(browser);
  await go(page, "/fil");
  await expect(page.getByTestId("stories-bar")).toBeVisible({ timeout: 30_000 });
  await shot(page, "barre-ordre-serveur");
  // Les cercles de la barre sont dans l'ordre du serveur.
  await expect(page.getByTestId(`stories-author-${authors[authors.length - 1]?.key}`)).toBeVisible({ timeout: 30_000 });
  const keys = await page
    .locator('[data-testid^="stories-author-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")?.replace("stories-author-", "") ?? ""));
  expect(keys).toEqual(authors.map((a) => a.key));

  await page.getByLabel(new RegExp(`Voir les stories de ${unseen[0]?.pseudoOrName}`)).click();
  await expect(page.getByTestId("story-viewer")).toBeVisible({ timeout: 30_000 });
  for (const [i, a] of unseen.entries()) {
    await expect(author(page)).toHaveText(a.pseudoOrName, { timeout: 30_000 });
    if (i === 1) await shot(page, "visionneuse-auteur-suivant");
    await readToTheEnd(page, a.pseudoOrName);
  }
  // Après le dernier non vu : la visionneuse se ferme, on est sur le Fil, tous les anneaux sont éteints.
  await expect(page.getByTestId("story-viewer")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId("stories-bar")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid^="stories-ring-"]:not([data-testid="stories-ring-seen"])')).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(page.getByTestId("stories-ring-seen")).toHaveCount(authors.length);
  await shot(page, "barre-anneaux-eteints");
  // La barre après lecture : déjà vues, même ordre.
  const after = await bar();
  expect(after.map((a) => a.key)).toEqual(authors.map((a) => a.key));
  expect(after.every((a) => !a.hasUnseen)).toBe(true);
  await ctx.close();
});

test("boutons « Auteur précédent » et « Auteur suivant », glissement à gauche et à droite", async ({ browser }) => {
  test.setTimeout(240_000);
  await resetViews();
  const authors = await bar();
  const first = authors[0]?.pseudoOrName ?? "";
  const second = authors[1]?.pseudoOrName ?? "";
  const { ctx, page } = await open(browser);
  await openFrom(page, first);
  await expect(author(page)).toHaveText(first);
  // Premier auteur de la chaîne : pas d'auteur précédent.
  await expect(page.getByRole("button", { name: "Auteur précédent" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Auteur suivant" })).toBeVisible();
  await shot(page, "visionneuse-boutons-auteur");
  await page.getByRole("button", { name: "Auteur suivant" }).click();
  await expect(author(page)).toHaveText(second, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Auteur précédent" })).toBeVisible();
  // Auteur précédent : on revient au premier, à sa dernière story.
  await page.getByRole("button", { name: "Auteur précédent" }).click();
  await expect(author(page)).toHaveText(first, { timeout: 30_000 });
  await expect(page.getByTestId("story-bar-next")).toHaveCount(0);
  await playing(page);
  // Glisser à gauche : l'auteur suivant ; à droite : le précédent.
  await page.mouse.move(300, 420);
  await page.mouse.down();
  for (let x = 300; x >= 100; x -= 40) await page.mouse.move(x, 424);
  await page.mouse.up();
  await expect(author(page)).toHaveText(second, { timeout: 30_000 });
  await playing(page);
  await page.mouse.move(100, 420);
  await page.mouse.down();
  for (let x = 100; x <= 300; x += 40) await page.mouse.move(x, 424);
  await page.mouse.up();
  await expect(author(page)).toHaveText(first, { timeout: 30_000 });
  await playing(page);
  // Un glissement vers le bas ferme toujours ; un glissement trop court ne change rien.
  await page.mouse.move(200, 300);
  await page.mouse.down();
  for (let x = 200; x <= 240; x += 10) await page.mouse.move(x, 304);
  await page.mouse.up();
  await expect(author(page)).toHaveText(first);
  await page.mouse.move(200, 300);
  await page.mouse.down();
  for (let y = 300; y <= 720; y += 60) await page.mouse.move(200, y);
  await page.mouse.up();
  await expect(page.getByTestId("story-viewer")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId("stories-bar")).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});

test("un seul écran dans l'historique : retour ramène au Fil après plusieurs auteurs", async ({ browser }) => {
  test.setTimeout(240_000);
  await resetViews();
  const authors = await bar();
  const { ctx, page } = await open(browser);
  await openFrom(page, authors[0]?.pseudoOrName ?? "");
  for (const a of authors.slice(1, 3)) {
    await page.getByRole("button", { name: "Auteur suivant" }).click();
    await expect(author(page)).toHaveText(a.pseudoOrName, { timeout: 30_000 });
  }
  await page.goBack();
  await expect(page.getByTestId("stories-bar")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("story-viewer")).toHaveCount(0);
  await ctx.close();
});

test("ouverte depuis un profil : la visionneuse se ferme à la fin de l'auteur, sans enchaîner", async ({ browser }) => {
  test.setTimeout(240_000);
  await resetViews();
  const { ctx, page } = await open(browser);
  await go(page, "/u/Kenji_66");
  await expect(page.getByTestId("profil-story-ring")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("profil-story-ring").click();
  await expect(page.getByTestId("story-viewer")).toBeVisible({ timeout: 30_000 });
  await expect(author(page)).toHaveText("Kenji_66");
  // Pas de chaîne : ni « Auteur précédent » ni « Auteur suivant ».
  await expect(page.getByRole("button", { name: "Auteur suivant" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Auteur précédent" })).toHaveCount(0);
  // Trois stories (le cas du plantage sur le téléphone) : on les lit toutes, puis la visionneuse se ferme sur le profil.
  await expect(page.getByTestId("story-bars").locator("> *")).toHaveCount(3);
  await readToTheEnd(page, "Kenji_66");
  await expect(page.getByTestId("story-viewer")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId("profil-story-ring")).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});

test("Béton et Sable : la visionneuse avec les boutons d'auteur (captures), police ×1,3", async ({ browser }) => {
  test.setTimeout(240_000);
  for (const [theme, width] of [
    ["beton", 384],
    ["sable", 390],
  ] as const) {
    await resetViews();
    const authors = await bar();
    const { ctx, page } = await open(browser, theme, width);
    await openFrom(page, authors[1]?.pseudoOrName ?? "");
    await shot(page, `visionneuse-${theme}-${width}`);
    await ctx.close();
  }
});
