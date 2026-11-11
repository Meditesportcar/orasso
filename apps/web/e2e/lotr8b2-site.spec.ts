import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, setTheme, signUpApi, unique } from "./helpers";
import { publishApi } from "./publications-helpers";
import { RELAIS } from "./relais";

// Lot R8b2 (D40, maquettes R8.1 `pr-profil` et R8.6 `pu-publi`), côté site : « Mon compte » et le profil d'un autre ont l'onglet
// « Publications » (ouvert par défaut, le mien compris), la grille de deux (trois colonnes au-delà de 900 px, date et lieu dessous,
// aucune pastille) et la vue « Une par une » (légende repliée après trois lignes), le dernier choix retenu, la page d'une
// publication seule et son menu (Supprimer), les états vides, le compte privé (le même panneau avec ou sans publication),
// « Mes publications » en redirection, l'ouverture d'une notification sur sa publication. Comptes du seed ; site et API lancés.
test.use({ actionTimeout: 30_000 });
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r8b2-captures/apres/recette-site`;

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

const userId = async (cookie: string) => (await apiCall<{ user: { id: string } }>(cookie, "GET", "/me")).data.user.id;
const selected = (page: Page) => page.getByTestId("profil-tabs").getByRole("tab", { selected: true });
const columns = (page: Page) =>
  page.evaluate(() => {
    const grid = document.querySelector('[data-testid="publications-grid"]');
    return grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 0;
  });

test("Mon compte : « Publications » par défaut, grille de deux (trois au-delà de 900 px), bascule retenue, « Publier » compact", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await setTheme(page, "beton");
  const kenji = await login("kenji@orasso.local");
  const mine = await apiCall<{ items: { id: string }[] }>(kenji, "GET", "/me/feed-posts");
  expect(mine.data.items.length).toBeGreaterThanOrEqual(3);
  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/moi");
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/app/moi");
    await expect(page.getByTestId("profil-head")).toBeVisible();
    await expect(page.getByTestId("profil-tabs").getByRole("tab")).toHaveText([
      /^Garage · \d+$/,
      "Sorties",
      "Publications",
    ]);
    await expect(selected(page)).toHaveAccessibleName("Publications");
    await expect(page.getByTestId("publications-grid")).toBeVisible({ timeout: 30_000 });
    expect(await columns(page), `${width} px`).toBe(width >= 900 ? 3 : 2);
    await expect(page.getByTestId("publications-count")).toHaveText(`${mine.data.items.length} publications`);
    await expect(page.getByTestId("publications-publish")).toBeVisible();
    await expect(page.getByTestId("publications-view-toggle")).toHaveAccessibleName("Affichage");
    await expect(page.getByTestId("publication-tile")).toHaveCount(mine.data.items.length);
    await expect(page.getByTestId("publication-tile-date").first()).toHaveText(/^\d{1,2} [a-zéû.]+/i);
    await expect(page.getByTestId("publication-tile-place").first()).toBeVisible();
    await expect(page.getByTestId("feed-card-feed_post")).toHaveCount(0);
    // Le compact : « Publier » ne dépasse pas 44 px de haut.
    expect((await page.getByTestId("publications-publish").boundingBox())?.height ?? 99).toBeLessThanOrEqual(44);
    await shot(page, `grille-${width}`);
    // Une par une : la carte entière du Fil ; le choix est retenu après un rechargement.
    await page.getByRole("button", { name: "Une par une" }).click();
    await expect(page.getByTestId("feed-card-feed_post")).toHaveCount(mine.data.items.length);
    await shot(page, `une-par-une-${width}`);
    await page.reload();
    await expect(page.getByTestId("publications-one-by-one")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Grille de deux" }).click();
    await page.reload();
    await expect(page.getByTestId("publications-grid")).toBeVisible({ timeout: 30_000 });
  }
  // Garage et Sorties restent intacts.
  await page.goto("/app/moi?onglet=garage");
  await expect(selected(page)).toHaveAccessibleName(/^Garage/);
  await page.goto("/app/moi?onglet=sorties");
  await expect(selected(page)).toHaveAccessibleName("Sorties");
});

test("une publication : vignette, page seule, légende repliée après trois lignes, supprimer par le menu, retirée", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await setTheme(page, "beton");
  await page.setViewportSize({ width: 390, height: 900 });
  const kenji = await login("kenji@orasso.local");
  const long = `Retour de la sortie du dimanche. ${"Une longue légende qui prend de la place sur plusieurs lignes. ".repeat(5)}`;
  const id = await publishApi(kenji, long);
  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/moi");
  await page.goto("/app/moi");
  await expect(page.getByTestId("publications-grid")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Une par une" }).click();
  const card = page.getByTestId("feed-card-feed_post").first();
  await expect(card).toContainText("Retour de la sortie du dimanche");
  const more = card.getByTestId("publication-caption-toggle");
  await expect(more).toHaveText("plus", { timeout: 15_000 });
  const folded = (await card.getByTestId("feed-post-caption").boundingBox())?.height ?? 0;
  await more.click();
  await expect(more).toHaveText("moins");
  expect((await card.getByTestId("feed-post-caption").boundingBox())?.height ?? 0).toBeGreaterThan(folded + 20);
  await more.click();
  await expect(more).toHaveText("plus");
  // La vignette ouvre la publication seule (légende entière, menu) ; le menu propose « Supprimer » (la mienne).
  await page.getByRole("button", { name: "Grille de deux" }).click();
  await page.getByTestId("publication-tile-open").first().click();
  await expect(page).toHaveURL(new RegExp(`/app/publication/${id}`));
  await expect(page.getByTestId("feed-card-feed_post")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("publication-caption-toggle")).toHaveCount(0);
  await shot(page, "publication-seule");
  await page.getByTestId("feed-card-more").click();
  await expect(page.getByTestId("publication-menu-remove")).toBeVisible();
  await expect(page.getByTestId("publication-menu-report")).toHaveCount(0);
  await shot(page, "publication-seule-menu");
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("publication-menu-remove").click();
  await expect(page).toHaveURL(/\/app\/moi\?onglet=publications/, { timeout: 30_000 });
  await expect(page.getByTestId("publications-grid")).toBeVisible({ timeout: 30_000 });
  expect((await apiCall(kenji, "GET", `/feed-posts/${id}`)).status).toBe(404);
  // Retirée : « Cette publication n'est plus visible. » et retour.
  await page.goto(`/app/publication/${id}`);
  await expect(page.getByTestId("publication-gone")).toContainText("Cette publication n'est plus visible.");
  await shot(page, "publication-retiree");
  await page.getByTestId("publication-gone-back").click();
  await expect(page).toHaveURL(/\/app\/fil/);
});

test("états vides, profil d'un autre et compte privé : mêmes mots, même panneau avec ou sans publication", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  await setTheme(page, "beton");
  await page.setViewportSize({ width: 390, height: 900 });
  // Un compte neuf, public, sans véhicule ni publication : l'état vide chez moi.
  const pseudo = `Neuf_${unique()}`.slice(0, 18);
  await signUpApi(pseudo);
  await loginInBrowser(page, `${pseudo.toLowerCase()}@e2e.orasso.test`, undefined, "/app/moi");
  await page.goto("/app/moi");
  await expect(selected(page)).toHaveAccessibleName("Publications");
  const empty = page.getByTestId("publications-empty");
  await expect(empty).toContainText("Publie ta première photo");
  await expect(empty).toContainText("Elle ira sur ton profil, et ton Fil la montrera à tes abonnés.");
  await expect(page.getByTestId("publications-publish")).toHaveAccessibleName("Publier");
  await shot(page, "vide-moi");

  // Un compte privé sans publication, et Marc_66 (privé, une publication au seed), vus par Kenji qui ne les suit pas.
  const quiet = `Prive_${unique()}`.slice(0, 18);
  const quietCookie = await signUpApi(quiet);
  expect((await apiCall(quietCookie, "PATCH", "/me/profile", { visibility: "private" })).status).toBe(200);
  const kenji = await login("kenji@orasso.local");
  const marcCookie = await login("marc@orasso.local");
  const bodies: unknown[] = [];
  for (const cookie of [marcCookie, quietCookie]) {
    const res = await apiCall<unknown>(kenji, "GET", `/authors/u:${await userId(cookie)}/feed-posts`);
    bodies.push(res.data);
  }
  expect(bodies[0]).toEqual(bodies[1]);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const other = await ctx.newPage();
  await setTheme(other, "beton");
  await loginInBrowser(other, "kenji@orasso.local", undefined, "/app/moi");
  const panels: string[] = [];
  for (const who of ["Marc_66", quiet]) {
    await other.goto(`/u/${who}`);
    await expect(other.getByTestId("profil-tabs").getByRole("tab")).toHaveText(["Publications"]);
    const panel = other.getByTestId("publications-private");
    await expect(panel).toContainText("Compte privé", { timeout: 30_000 });
    await expect(panel).toContainText(`Les publications de ${who} ne sont visibles que de ses abonnés acceptés.`);
    panels.push((await panel.innerText()).replaceAll(who, "<pseudo>"));
    await expect(other.getByTestId("publication-tile")).toHaveCount(0);
  }
  expect(panels[0]).toBe(panels[1]);
  await shot(other, "profil-prive");
  // « Demander à suivre » (sur le compte de recette), puis le panneau le dit.
  await other.getByTestId("publications-private-ask").click();
  await expect(other.getByTestId("publications-private-ask")).toHaveText(`Demande envoyée à ${quiet}`, {
    timeout: 30_000,
  });
  // Chez un autre sans publication : « Garage » (Lea_11) ; sans véhicule : « Sorties » (le compte neuf) ; avec : « Publications ».
  await other.goto("/u/Lea_11");
  await expect(selected(other)).toHaveAccessibleName(/^Garage/);
  await other.getByTestId("profil-tab-publications").click();
  await expect(other.getByTestId("publications-empty")).toContainText("Lea_11 n'a rien publié pour l'instant.");
  await shot(other, "vide-autre");
  await other.goto(`/u/${pseudo}`);
  await expect(selected(other)).toHaveAccessibleName("Sorties");
  await other.goto("/u/Julie_66");
  await expect(selected(other)).toBeVisible();
  await other.goto("/u/Kenji_66");
  await expect(other.getByTestId("profil-tabs")).toBeVisible();
  await ctx.close();
});

test("profil d'un autre avec publications : « Publications » par défaut, sans « Publier », « Signaler » dans le menu", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await setTheme(page, "beton");
  await loginInBrowser(page, "lea@orasso.local", undefined, "/app/moi");
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/u/Kenji_66");
    await expect(selected(page)).toHaveAccessibleName("Publications");
    await expect(page.getByTestId("publications-grid")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("publications-publish")).toHaveCount(0);
    await expect(page.getByTestId("publications-count")).toContainText(/\d+ publications/);
    await shot(page, `profil-autre-publications-${width}`);
  }
  await page.getByTestId("publication-tile-open").first().click();
  await expect(page).toHaveURL(/\/app\/publication\//);
  await page.getByTestId("feed-card-more").click();
  await expect(page.getByTestId("publication-menu-report")).toBeVisible();
  await expect(page.getByTestId("publication-menu-remove")).toHaveCount(0);
});

test("« Mes publications » redirige ; une notification de publication ouvre la publication seule", async ({ page }) => {
  test.setTimeout(240_000);
  await setTheme(page, "beton");
  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/moi");
  await page.goto("/app/fil/mes-publications");
  await expect(page).toHaveURL(/\/app\/moi\?onglet=publications/);
  await expect(page.getByTestId("publications-grid")).toBeVisible({ timeout: 30_000 });
  // Un compte neuf cite Kenji_66 : « te cite dans une publication » (`postId` dans les données) ouvre la publication.
  const author = `Cite_${unique()}`.slice(0, 18);
  const cookie = await signUpApi(author);
  const id = await publishApi(cookie, `Merci @Kenji_66 pour la sortie ${unique()}`);
  await page.goto("/app/activite");
  const row = page.getByText(`${author} te cite dans une publication`).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/app/publication/${id}`), { timeout: 30_000 });
  await expect(page.getByTestId("feed-card-feed_post")).toContainText("Merci @Kenji_66");
});
