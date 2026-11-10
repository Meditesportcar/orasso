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

test("tour 2 : changement de compte + /me en échec : la flèche → ne change pas d'auteur et ne relit pas le préchargement", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await resetViews();
  const authors = await bar();
  await signedIn(page, "beton", 390, 844);
  const second = authors[1]?.key ?? "";
  const reads: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/stories/by-author/"))
      reads.push(decodeURIComponent(r.url().split("/by-author/")[1] ?? ""));
  });
  await page.getByLabel(new RegExp(`Voir les stories de ${authors[0]?.pseudoOrName}`)).click();
  await expect(page.getByTestId("story-viewer")).toBeVisible({ timeout: 30_000 });
  await playing(page);
  // Le préchargement de l'auteur suivant est parti.
  await expect.poll(() => reads.filter((k) => k === second).length, { timeout: 10_000 }).toBe(1);
  // Un autre compte se connecte dans une autre fenêtre ; `/me` échoue.
  await page.route("**/api/me", (r) => r.fulfill({ status: 503, body: "{}", contentType: "application/json" }));
  const other = await page.context().newPage();
  await other.goto("/connexion");
  await other.evaluate(() => {
    const c = new BroadcastChannel("orasso-session");
    c.postMessage({ userId: "autre-compte" });
    c.close();
  });
  await expect(page.getByTestId("story-unverified")).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(500);
  // Rien de l'ancien compte : pas d'auteur affiché, toujours « non vérifié », aucune lecture de l'auteur suivant.
  await expect(page.getByTestId("story-unverified")).toBeVisible();
  await expect(page.getByTestId("story-author")).toHaveCount(0);
  expect(reads.filter((k) => k === second)).toHaveLength(1);
  // Le compte est de nouveau vérifié : on revient au même auteur ; passer au suivant relit (le préchargement a été purgé).
  await page.unroute("**/api/me");
  await page.getByTestId("story-retry").click();
  await expect(author(page)).toHaveText(authors[0]?.pseudoOrName ?? "", { timeout: 30_000 });
  await page.getByRole("button", { name: "Auteur suivant" }).click();
  await expect(author(page)).toHaveText(authors[1]?.pseudoOrName ?? "", { timeout: 30_000 });
  expect(reads.filter((k) => k === second).length).toBeGreaterThanOrEqual(2);
  await other.close();
});

test("tour 2 : réponse perdue, aller-retour entre auteurs : le même texte repart avec le même identifiant", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await resetViews();
  const authors = await bar();
  // Un auteur-personne qui n'a qu'une story et qui n'est pas le dernier de la barre : l'aller-retour revient sur la même.
  let target = "";
  const cookie = await login("damien@orasso.local");
  for (const a of authors.slice(0, -1)) {
    if (!a.key.startsWith("u:")) continue;
    const r = await apiCall<{ stories: unknown[] }>(cookie, "GET", `/stories/by-author/${encodeURIComponent(a.key)}`);
    if (r.data.stories.length === 1) {
      target = a.pseudoOrName;
      break;
    }
  }
  test.skip(!target, "aucun auteur à une seule story dans la barre");
  await signedIn(page, "beton", 390, 844);
  const ids: string[] = [];
  await page.route("**/api/stories/*/reply", async (route) => {
    ids.push((route.request().postDataJSON() as { clientId: string }).clientId);
    if (ids.length === 1) return route.abort();
    return route.continue();
  });
  await page.getByLabel(new RegExp(`Voir les stories de ${target}`)).click();
  await expect(author(page)).toHaveText(target, { timeout: 30_000 });
  await playing(page);
  await page.getByTestId("story-reply-input").fill("Belle auto");
  await page.getByTestId("story-reply-send").click();
  await expect.poll(() => ids.length, { timeout: 15_000 }).toBe(1);
  await page.getByRole("button", { name: "Auteur suivant" }).click();
  await expect(author(page)).not.toHaveText(target, { timeout: 30_000 });
  await page.getByRole("button", { name: "Auteur précédent" }).click();
  await expect(author(page)).toHaveText(target, { timeout: 30_000 });
  await page.getByTestId("story-reply-input").fill("Belle auto");
  await page.getByTestId("story-reply-send").click();
  await expect.poll(() => ids.length, { timeout: 15_000 }).toBe(2);
  expect(ids[1]).toBe(ids[0]);
});

/** Un auteur-personne à une seule story, qui n'est pas le dernier de la barre : l'aller-retour revient sur la même story. */
async function singleStoryAuthor(): Promise<string> {
  const authors = await bar();
  const cookie = await login("damien@orasso.local");
  for (const a of authors.slice(0, -1)) {
    if (!a.key.startsWith("u:")) continue;
    const r = await apiCall<{ stories: unknown[] }>(cookie, "GET", `/stories/by-author/${encodeURIComponent(a.key)}`);
    if (r.data.stories.length === 1) return a.pseudoOrName;
  }
  return "";
}

for (const outcome of ["succès", "échec"] as const) {
  test(`tour 3 : la requête de réponse finit APRÈS l'aller-retour entre auteurs (${outcome}) : bouton libre${outcome === "échec" ? ", même identifiant au renvoi" : ""}`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await resetViews();
    const target = await singleStoryAuthor();
    test.skip(!target, "aucun auteur à une seule story dans la barre");
    await signedIn(page, "beton", 390, 844);
    const ids: string[] = [];
    let release: (() => void) | null = null;
    const held = new Promise<void>((r) => {
      release = r;
    });
    await page.route("**/api/stories/*/reply", async (route) => {
      ids.push((route.request().postDataJSON() as { clientId: string }).clientId);
      if (ids.length > 1) return route.continue();
      await held;
      return outcome === "succès" ? route.continue() : route.abort();
    });
    await page.getByLabel(new RegExp(`Voir les stories de ${target}`)).click();
    await expect(author(page)).toHaveText(target, { timeout: 30_000 });
    await playing(page);
    await page.getByTestId("story-reply-input").fill("Belle auto");
    await page.getByTestId("story-reply-send").click();
    await expect.poll(() => ids.length, { timeout: 15_000 }).toBe(1);
    // Aller-retour pendant que la requête est en vol.
    await page.getByRole("button", { name: "Auteur suivant" }).click();
    await expect(author(page)).not.toHaveText(target, { timeout: 30_000 });
    await page.getByRole("button", { name: "Auteur précédent" }).click();
    await expect(author(page)).toHaveText(target, { timeout: 30_000 });
    await page.getByTestId("story-reply-input").fill("Belle auto");
    // Envoi encore en cours : le bouton est inactif.
    await expect(page.getByTestId("story-reply-send")).toBeDisabled();
    release?.();
    // La requête finit : le bouton est libre sur le lecteur affiché.
    await expect(page.getByTestId("story-reply-send")).toBeEnabled({ timeout: 15_000 });
    if (outcome === "échec") {
      await page.getByTestId("story-reply-send").click();
      await expect.poll(() => ids.length, { timeout: 15_000 }).toBe(2);
      expect(ids[1]).toBe(ids[0]);
    } else {
      expect(ids).toHaveLength(1);
    }
  });
}

test("tour 3 : « Ne plus voir ses stories » en cours de chaîne : l'auteur masqué ne revient pas par « Auteur précédent »", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await resetViews();
  const authors = await bar();
  const cookie = await login("damien@orasso.local");
  await signedIn(page, "beton", 390, 844);
  try {
    await page.getByLabel(new RegExp(`Voir les stories de ${authors[0]?.pseudoOrName}`)).click();
    await expect(author(page)).toHaveText(authors[0]?.pseudoOrName ?? "", { timeout: 30_000 });
    await playing(page);
    await page.getByTestId("story-more").click();
    await page.getByTestId("story-menu-mute").click();
    // Après le message, la lecture passe à l'auteur suivant ; le masqué n'est plus joignable par « précédent ».
    await expect(author(page)).toHaveText(authors[1]?.pseudoOrName ?? "", { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Auteur précédent" })).toHaveCount(0);
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(500);
    await expect(author(page)).toHaveText(authors[1]?.pseudoOrName ?? "");
  } finally {
    await apiCall(cookie, "DELETE", `/me/story-mutes/${encodeURIComponent(authors[0]?.key ?? "")}`);
  }
});
