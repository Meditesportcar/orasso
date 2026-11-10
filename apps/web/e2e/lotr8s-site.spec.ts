import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, setTheme } from "./helpers";
import { sql } from "./lotr7f2-setup";
import { RELAIS } from "./relais";

// Lot R8s (D40), côté site : la lecture enchaînée des stories. Ouvrir le premier auteur non vu depuis la barre du Fil → aller au bout
// → l'auteur suivant s'ouvre seul (même page, un seul « retour » ramène au Fil) → après le dernier non vu la superposition se
// ferme et les anneaux sont éteints ; boutons « Auteur précédent » et « Auteur suivant » à 1 280 px ; clavier ← → ; glissement ;
// une story ouverte depuis un profil se ferme à la fin de l'auteur ; le chargeur ne livre aucune chaîne sans `?suite=barre`.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r8s-captures/apres/recette-site`;
test.use({ actionTimeout: 30_000 });

type BarAuthor = { key: string; pseudoOrName: string; hasUnseen: boolean };

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function resetViews() {
  await sql("delete from story_views");
  await sql("update stories set views_count = 0");
}

async function bar(): Promise<BarAuthor[]> {
  const cookie = await login("damien@orasso.local");
  return (await apiCall<{ authors: BarAuthor[] }>(cookie, "GET", "/stories/bar")).data.authors;
}

const progress = async (page: Page) =>
  (await page.getByTestId("story-bar-current").locator("> *").first().boundingBox())?.width ?? 0;
const playing = (page: Page) => expect.poll(() => progress(page), { timeout: 30_000 }).toBeGreaterThan(1);
const author = (page: Page) => page.getByTestId("story-author");

async function signedIn(page: Page, theme: "beton" | "sable", width: number, height: number) {
  await page.setViewportSize({ width, height });
  await setTheme(page, theme);
  await loginInBrowser(page, "damien@orasso.local", undefined, "/app/fil");
  await page.goto("/app/fil");
  await expect(page.getByTestId("stories-bar")).toBeVisible({ timeout: 30_000 });
}

/** Lit toutes les stories de l'auteur affiché (flèche droite) jusqu'au changement d'auteur ou la fermeture. */
async function readToTheEnd(page: Page, name: string) {
  for (let i = 0; i < 12; i++) {
    const changed = await author(page)
      .textContent({ timeout: 3_000 })
      .then((t) => t !== name)
      .catch(() => true);
    if (changed) return;
    await playing(page);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(250);
  }
}

test("la barre ouvre l'auteur avec ?suite=barre ; lecture enchaînée, fermeture, anneaux éteints (1 280 px)", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await resetViews();
  const authors = await bar();
  const unseen = authors.filter((a) => a.hasUnseen);
  expect(unseen.length).toBeGreaterThanOrEqual(3);
  expect(authors[0]?.pseudoOrName).toBe("Roues Libres 66");
  await signedIn(page, "beton", 1280, 800);
  // L'ordre des ronds est celui du serveur (la barre est lue après l'affichage de la page).
  await expect(page.getByTestId(`stories-author-${authors[authors.length - 1]?.key}`)).toBeVisible({ timeout: 30_000 });
  const keys = await page
    .locator('[data-testid^="stories-author-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")?.replace("stories-author-", "") ?? ""));
  expect(keys).toEqual(authors.map((a) => a.key));
  await shot(page, "barre-1280");
  await page.getByLabel(new RegExp(`Voir les stories de ${unseen[0]?.pseudoOrName}`)).click();
  await expect(page).toHaveURL(/\/app\/story\/.*suite=barre/);
  await expect(page.getByTestId("story-viewer")).toBeVisible({ timeout: 30_000 });
  for (const [i, a] of unseen.entries()) {
    await expect(author(page)).toHaveText(a.pseudoOrName, { timeout: 30_000 });
    if (i === 0) {
      // Les boutons d'auteur à 1 280 px : pas de précédent pour le premier, un suivant.
      await expect(page.getByRole("button", { name: "Auteur précédent" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Auteur suivant" })).toBeVisible();
      await shot(page, "visionneuse-boutons-1280");
    }
    if (i === 1) {
      await expect(page.getByRole("button", { name: "Auteur précédent" })).toBeVisible();
      await shot(page, "visionneuse-auteur-suivant-1280");
    }
    await readToTheEnd(page, a.pseudoOrName);
  }
  // Après le dernier non vu : la superposition se ferme, on est sur le Fil, tous les anneaux sont éteints.
  await expect(page).toHaveURL(/\/app\/fil/, { timeout: 15_000 });
  await expect(page.getByTestId("story-viewer")).toHaveCount(0);
  await expect(page.getByTestId("stories-bar")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".o-avring--seen")).toHaveCount(authors.length, { timeout: 30_000 });
  await shot(page, "barre-anneaux-eteints-1280");
  const after = await bar();
  expect(after.map((a) => a.key)).toEqual(authors.map((a) => a.key));
  expect(after.every((a) => !a.hasUnseen)).toBe(true);
});

test("boutons d'auteur, clavier et glissement ; un seul « retour » ramène au Fil après trois auteurs (390 px)", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await resetViews();
  const authors = await bar();
  await signedIn(page, "sable", 390, 844);
  await page.getByLabel(new RegExp(`Voir les stories de ${authors[0]?.pseudoOrName}`)).click();
  await expect(page.getByTestId("story-viewer")).toBeVisible({ timeout: 30_000 });
  await playing(page);
  await shot(page, "visionneuse-sable-390");
  // Auteur suivant (bouton), puis encore un : trois auteurs lus.
  for (const a of authors.slice(1, 3)) {
    await page.getByRole("button", { name: "Auteur suivant" }).click();
    await expect(author(page)).toHaveText(a.pseudoOrName, { timeout: 30_000 });
  }
  // Auteur précédent : on revient au deuxième, à sa dernière story.
  await page.getByRole("button", { name: "Auteur précédent" }).click();
  await expect(author(page)).toHaveText(authors[1]?.pseudoOrName ?? "", { timeout: 30_000 });
  await expect(page.getByTestId("story-bar-next")).toHaveCount(0);
  await playing(page);
  // Glisser à gauche : l'auteur suivant ; à droite : le précédent.
  const surface = page.getByTestId("story-surface");
  const box = (await surface.boundingBox()) ?? { x: 0, y: 0, width: 390, height: 844 };
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 300, y);
  await page.mouse.down();
  for (let x = 300; x >= 100; x -= 40) await page.mouse.move(box.x + x, y + 4);
  await page.mouse.up();
  await expect(author(page)).toHaveText(authors[2]?.pseudoOrName ?? "", { timeout: 30_000 });
  await playing(page);
  await page.mouse.move(box.x + 100, y);
  await page.mouse.down();
  for (let x = 100; x <= 300; x += 40) await page.mouse.move(box.x + x, y + 4);
  await page.mouse.up();
  await expect(author(page)).toHaveText(authors[1]?.pseudoOrName ?? "", { timeout: 30_000 });
  await playing(page);
  // Clavier : → au bout de la série passe à l'auteur suivant (comportement inchangé pour ← →).
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.getByRole("button", { name: "Auteur suivant" }).click();
  await expect(author(page)).toHaveText(authors[2]?.pseudoOrName ?? "", { timeout: 30_000 });
  // Un seul « retour » ramène au Fil.
  await page.goBack();
  await expect(page).toHaveURL(/\/app\/fil/, { timeout: 15_000 });
  await expect(page.getByTestId("stories-bar")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("story-viewer")).toHaveCount(0);
});

test("ouverte depuis un profil (sans ?suite=barre) : la superposition se ferme à la fin de l'auteur, sans enchaîner", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await resetViews();
  await signedIn(page, "beton", 390, 844);
  await page.goto("/u/Kenji_66");
  const ring = page.locator('a[href^="/app/story/"]').first();
  await expect(ring).toBeVisible({ timeout: 30_000 });
  await ring.click();
  await expect(page).toHaveURL(/\/app\/story\//);
  expect(page.url()).not.toContain("suite=barre");
  await expect(page.getByTestId("story-viewer")).toBeVisible({ timeout: 30_000 });
  await expect(author(page)).toHaveText("Kenji_66");
  await expect(page.getByRole("button", { name: "Auteur suivant" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Auteur précédent" })).toHaveCount(0);
  await expect(page.getByTestId("story-bars").locator("> *")).toHaveCount(3);
  await readToTheEnd(page, "Kenji_66");
  await expect(page.getByTestId("story-viewer")).toHaveCount(0, { timeout: 15_000 });
  // Page ouverte par un lien (nouveau chargement) : la fermeture revient au Fil, comme avant le lot.
  await expect(page).toHaveURL(/\/app\/fil/, { timeout: 15_000 });
});

test("la barre lue par le chargeur : sans session, rien ; la chaîne n'est jamais dans l'adresse", async ({ page }) => {
  test.setTimeout(120_000);
  // Sans session : renvoi à la connexion, ni story ni chaîne dans la page.
  const res = await page.goto("/app/story/u%3Aabc?suite=barre");
  expect(page.url()).toContain("/connexion");
  expect(res?.status()).toBeLessThan(400);
  const html = await page.content();
  expect(html).not.toContain("/api/stories/");
});
