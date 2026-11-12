import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD, signUpApi, unique } from "./helpers";
import { publishApi } from "./publications-helpers";
import { RELAIS } from "./relais";

// Lot R8b2 (D40, maquettes R8.1 `pr-profil` et R8.6 `pu-publi`), côté appli (version web compilée de recette) : l'onglet
// « Publications » du profil (ouvert par défaut, le mien compris), la grille de deux (date et lieu dessous, aucune pastille) et la
// vue « Une par une » (légende repliée après trois lignes), le dernier choix retenu, la page d'une publication seule et son menu
// (Supprimer), les états vides, le profil d'un autre (s'ouvre sur ses publications, ou sur « Garage » sans publication), le compte
// privé (le même panneau avec ou sans publication), « Mes publications » en redirection, l'ouverture d'une notification sur sa
// publication. Lancer avec APP_URL (appli compilée), API seedée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r8b2-captures/apres/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

async function open(browser: Browser, fontScale = 1, theme: "beton" | "sable" = "beton", width = 390) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, baseURL: APP });
  await ctx.addInitScript(
    ([f, th]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", th as string);
      if (f !== 1) localStorage.setItem("orasso.recette.echellePolice", String(f));
    },
    [fontScale, theme] as const,
  );
  return { ctx, page: await ctx.newPage() };
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
  await page.waitForURL(/accueil/, { timeout: 60_000 });
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

const selected = (page: Page) => page.getByTestId("profil-tabs").getByRole("tab", { selected: true });

const userId = async (cookie: string) => (await apiCall<{ user: { id: string } }>(cookie, "GET", "/me")).data.user.id;

test("mon profil : « Publications » par défaut, grille de deux sans pastille, bascule retenue, « Publier » compact", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const kenji = await login("kenji@orasso.local");
  const mine = await apiCall<{ items: { id: string }[]; nextCursor: string | null }>(kenji, "GET", "/me/feed-posts");
  expect(mine.data.items.length).toBeGreaterThanOrEqual(3);
  const { ctx, page } = await open(browser);
  await signIn(page, "kenji@orasso.local");
  await go(page, "/profil");
  await expect(page.getByTestId("profil-head")).toBeVisible({ timeout: 30_000 });
  // L'ordre des onglets et l'ouverture par défaut (le mien compris).
  await expect(page.getByTestId("profil-tabs").getByRole("tab")).toHaveText([
    /^Garage · \d+$/,
    "Sorties",
    "Publications",
  ]);
  await expect(selected(page)).toHaveAccessibleName("Publications");
  await expect(page.getByTestId("publications-grid")).toBeVisible({ timeout: 30_000 });
  // La ligne « N publications », « Publier » (seul bouton principal) et la bascule des deux vues.
  await expect(page.getByTestId("publications-count")).toHaveText(`${mine.data.items.length} publications`);
  await expect(page.getByTestId("publications-publish")).toBeVisible();
  await expect(page.getByTestId("publications-view-toggle")).toHaveAccessibleName("Affichage");
  await expect(page.getByRole("button", { name: "Grille de deux" })).toHaveAttribute("aria-pressed", "true");
  // Grille de deux : deux vignettes par ligne, 4:5, date puis lieu dessous, aucune pastille.
  const tiles = page.getByTestId("publication-tile");
  await expect(tiles).toHaveCount(mine.data.items.length);
  const a = await tiles.nth(0).getByTestId("publication-tile-open").boundingBox();
  const b = await tiles.nth(1).getByTestId("publication-tile-open").boundingBox();
  expect(a && b && Math.abs(a.y - b.y) < 2 && b.x > a.x).toBe(true);
  expect(a && Math.abs(a.height / a.width - 1.25) < 0.02).toBe(true);
  await expect(tiles.first().getByTestId("publication-tile-date")).toHaveText(/^\d{1,2} [a-zéû.]+/i);
  await expect(page.getByTestId("publication-tile-place").first()).toBeVisible();
  await expect(page.getByTestId("feed-card-feed_post")).toHaveCount(0);
  await shot(page, "grille");
  // Une par une : la carte entière du Fil ; le choix est retenu après un rechargement.
  await page.getByRole("button", { name: "Une par une" }).click();
  await expect(page.getByTestId("publications-one-by-one")).toBeVisible();
  await expect(page.getByTestId("feed-card-feed_post")).toHaveCount(mine.data.items.length);
  await shot(page, "une-par-une");
  await go(page, "/profil");
  await expect(page.getByTestId("publications-one-by-one")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Grille de deux" }).click();
  await go(page, "/profil");
  await expect(page.getByTestId("publications-grid")).toBeVisible({ timeout: 30_000 });
  // Un onglet demandé par l'adresse l'emporte ; « Garage » et « Sorties » restent intacts.
  await go(page, "/profil?onglet=garage");
  await expect(selected(page)).toHaveAccessibleName(/^Garage/);
  await go(page, "/profil?onglet=sorties");
  await expect(selected(page)).toHaveAccessibleName("Sorties");
  await ctx.close();
});

test("une publication : vignette, page seule, légende repliée après trois lignes, supprimer par le menu", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const kenji = await login("kenji@orasso.local");
  const long = `Retour de la sortie du dimanche. ${"Une longue légende qui prend de la place sur plusieurs lignes. ".repeat(5)}`;
  const id = await publishApi(kenji, long);
  const { ctx, page } = await open(browser);
  await signIn(page, "kenji@orasso.local");
  await go(page, "/profil");
  await expect(page.getByTestId("publications-grid")).toBeVisible({ timeout: 30_000 });
  // Une par une : la légende est repliée (« plus »), « moins » la replie de nouveau.
  await page.getByRole("button", { name: "Une par une" }).click();
  const card = page.getByTestId("feed-card-feed_post").first();
  await expect(card).toContainText("Retour de la sortie du dimanche");
  const more = card.getByTestId("publication-caption-toggle");
  await expect(more).toHaveText("plus", { timeout: 15_000 });
  const folded = (await card.getByTestId("feed-post-caption").boundingBox())?.height ?? 0;
  await more.click();
  await expect(more).toHaveText("moins");
  expect((await card.getByTestId("feed-post-caption").boundingBox())?.height ?? 0).toBeGreaterThan(folded + 20);
  await shot(page, "legende-depliee");
  await more.click();
  await expect(more).toHaveText("plus");
  // La vignette ouvre la publication seule (carte entière, légende entière, menu) ; le retour revient au profil.
  await page.getByRole("button", { name: "Grille de deux" }).click();
  await page.getByTestId("publication-tile-open").first().click();
  await expect(page).toHaveURL(new RegExp(`/publication/${id}`));
  await expect(page.getByTestId("feed-card-feed_post")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("publication-caption-toggle")).toHaveCount(0);
  await shot(page, "publication-seule");
  await page.getByTestId("feed-card-more").click();
  await expect(page.getByTestId("publication-menu-remove")).toBeVisible();
  await expect(page.getByTestId("publication-menu-report")).toHaveCount(0);
  await shot(page, "publication-seule-menu");
  // Supprimer : confirmation, retour au profil, la vignette n'y est plus ; l'API ne la rend plus.
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("publication-menu-remove").click();
  await expect(page.getByTestId("publications-grid")).toBeVisible({ timeout: 30_000 });
  expect((await apiCall(kenji, "GET", `/feed-posts/${id}`)).status).toBe(404);
  await go(page, `/publication/${id}`);
  await expect(page.getByTestId("publication-gone")).toContainText("Cette publication n'est plus visible.", {
    timeout: 30_000,
  });
  await shot(page, "publication-retiree");
  await ctx.close();
});

test("états vides : chez moi « Publie ta première photo » ; chez un autre, « Garage » ; sans véhicule, « Sorties »", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  // Un compte neuf, public, sans véhicule ni publication.
  const pseudo = `Neuf_${unique()}`.slice(0, 18);
  await signUpApi(pseudo);
  const { ctx, page } = await open(browser);
  await signIn(page, `${pseudo.toLowerCase()}@e2e.orasso.test`);
  await go(page, "/profil");
  await expect(selected(page)).toHaveAccessibleName("Publications", { timeout: 30_000 });
  const empty = page.getByTestId("publications-empty");
  await expect(empty).toContainText("Publie ta première photo");
  await expect(empty).toContainText("Elle ira sur ton profil, et ton Fil la montrera à tes abonnés.");
  await expect(page.getByTestId("publications-publish")).toHaveAccessibleName("Publier");
  await shot(page, "vide-moi");
  await ctx.close();

  // Chez un autre sans publication : le profil s'ouvre sur « Garage » (Lea_11 a un véhicule, aucune publication).
  const b = await open(browser);
  await signIn(b.page, "kenji@orasso.local");
  await go(b.page, "/u/Lea_11");
  await expect(b.page.getByTestId("profil-tabs")).toBeVisible({ timeout: 30_000 });
  await expect(selected(b.page)).toHaveAccessibleName(/^Garage/);
  // Les deux autres onglets restent là ; « Publications » dit l'état vide d'un autre.
  await b.page.getByTestId("profil-tab-publications").click();
  await expect(b.page.getByTestId("publications-empty")).toContainText("Pas encore de publication");
  await expect(b.page.getByTestId("publications-empty")).toContainText("Lea_11 n'a rien publié pour l'instant.");
  await expect(b.page.getByTestId("publications-publish")).toHaveCount(0);
  await shot(b.page, "vide-autre");
  // Un autre sans véhicule ni publication : « Sorties » (le compte neuf).
  await go(b.page, `/u/${pseudo}`);
  await expect(b.page.getByTestId("profil-tabs")).toBeVisible({ timeout: 30_000 });
  await expect(selected(b.page)).toHaveAccessibleName("Sorties");
  await expect(b.page.getByTestId("profil-tab-garage")).toHaveCount(0);
  await b.ctx.close();
});

test("profil d'un autre : « Publications » par défaut avec ses publications, sans « Publier », une vignette ouvre la publication", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser);
  await signIn(page, "lea@orasso.local");
  await go(page, "/u/Kenji_66");
  await expect(page.getByTestId("profil-tabs")).toBeVisible({ timeout: 30_000 });
  await expect(selected(page)).toHaveAccessibleName("Publications");
  await expect(page.getByTestId("publications-grid")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("publications-publish")).toHaveCount(0);
  await expect(page.getByTestId("publications-count")).toContainText(/\d+ publications/);
  await shot(page, "profil-autre-publications");
  await page.getByTestId("publication-tile-open").first().click();
  await expect(page).toHaveURL(/\/publication\//);
  await expect(page.getByTestId("feed-card-feed_post")).toBeVisible({ timeout: 30_000 });
  // La publication d'un autre : « Signaler », jamais « Supprimer ».
  await page.getByTestId("feed-card-more").click();
  await expect(page.getByTestId("publication-menu-report")).toBeVisible();
  await expect(page.getByTestId("publication-menu-remove")).toHaveCount(0);
  await ctx.close();
});

test("compte privé : le même panneau avec ou sans publication, « Demander à suivre », rien de plus par l'API", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  // Marc_66 (privé, une publication au seed) et un compte privé sans publication, vus par Kenji (qui ne les suit pas).
  const quiet = `Prive_${unique()}`.slice(0, 18);
  const quietCookie = await signUpApi(quiet);
  expect((await apiCall(quietCookie, "PATCH", "/me/profile", { visibility: "private" })).status).toBe(200);
  const kenji = await login("kenji@orasso.local");
  const marcCookie = await login("marc@orasso.local");
  const bodies: unknown[] = [];
  for (const cookie of [marcCookie, quietCookie]) {
    const res = await apiCall<unknown>(kenji, "GET", `/authors/u:${await userId(cookie)}/feed-posts`);
    expect(res.status).toBe(200);
    bodies.push(res.data);
  }
  expect(bodies[0]).toEqual(bodies[1]);
  expect(bodies[0]).toEqual({ items: [], nextCursor: null, restricted: true });
  // Aucun détail du contenu dans la fiche du profil : le compteur est nul (liste restreinte).
  const profile = await apiCall<{ publications: unknown }>(kenji, "GET", "/users/Marc_66");
  expect(profile.data.publications).toBeNull();

  const { ctx, page } = await open(browser);
  await signIn(page, "kenji@orasso.local");
  const panels: string[] = [];
  for (const pseudo of ["Marc_66", quiet]) {
    await go(page, `/u/${pseudo}`);
    await expect(page.getByTestId("profil-tabs").getByRole("tab")).toHaveText(["Publications"], { timeout: 30_000 });
    const panel = page.getByTestId("publications-private");
    await expect(panel).toContainText("Compte privé");
    await expect(panel).toContainText(`Les publications de ${pseudo} ne sont visibles que de ses abonnés acceptés.`);
    panels.push((await panel.innerText()).replaceAll(pseudo, "<pseudo>"));
    await expect(page.getByTestId("publication-tile")).toHaveCount(0);
  }
  expect(panels[0]).toBe(panels[1]);
  await shot(page, "profil-prive");
  // « Demander à suivre » envoie la demande (sur le compte de recette), puis le panneau le dit.
  await page.getByTestId("publications-private-ask").click();
  await expect(page.getByTestId("publications-private-ask")).toHaveText(`Demande envoyée à ${quiet}`, {
    timeout: 30_000,
  });
  await expect(page.getByTestId("publications-private-ask")).toBeDisabled();
  await ctx.close();
});

test("« Mes publications » redirige vers mon onglet « Publications » ; une publication retirée ou invisible le dit", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const { ctx, page } = await open(browser);
  await signIn(page, "kenji@orasso.local");
  await go(page, "/fil/mes-publications");
  await expect(page.getByTestId("profil-head")).toBeVisible({ timeout: 30_000 });
  await expect(selected(page)).toHaveAccessibleName("Publications");
  await expect(page.getByTestId("publications-grid")).toBeVisible({ timeout: 30_000 });
  // La publication d'un compte privé que je ne suis pas : « n'est plus visible », sans dire pourquoi.
  const marc = await login("marc@orasso.local");
  const hers = await apiCall<{ items: { id: string }[] }>(marc, "GET", "/me/feed-posts");
  await go(page, `/publication/${hers.data.items[0]?.id}`);
  await expect(page.getByTestId("publication-gone")).toContainText("Cette publication n'est plus visible.", {
    timeout: 30_000,
  });
  await page.getByTestId("publication-gone-back").click();
  await expect(page).toHaveURL(/\/fil/);
  await ctx.close();
});

test("une notification de publication ouvre la publication seule", async ({ browser }) => {
  test.setTimeout(240_000);
  // Un compte neuf cite Kenji_66 dans sa publication : Kenji reçoit « te cite dans une publication » (`postId` dans les données).
  const author = `Cite_${unique()}`.slice(0, 18);
  const cookie = await signUpApi(author);
  const id = await publishApi(cookie, `Merci @Kenji_66 pour la sortie ${unique()}`);
  const { ctx, page } = await open(browser);
  await signIn(page, "kenji@orasso.local");
  // La notification arrive un instant après la publication : l'écran de l'Activité est rouvert jusqu'à l'y voir.
  const row = page.getByText(`${author} te cite dans une publication`).first();
  await expect(async () => {
    await go(page, "/activite");
    await expect(row).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 90_000 });
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/publication/${id}`), { timeout: 30_000 });
  await expect(page.getByTestId("feed-card-feed_post")).toContainText("Merci @Kenji_66");
  await ctx.close();
});

test("organisateur sur un compte privé : Garage et Sorties restent visibles, « Publications » montre le panneau « Compte privé »", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  // Sarah_66 est l'organisatrice d'un événement où Marc_66 (compte privé) candidate : l'audience est « organisateur ».
  const sarah = await login("sarah@orasso.local");
  const view = await apiCall<{ audience: string; publications: unknown }>(sarah, "GET", "/users/Marc_66");
  expect(view.data.audience).toBe("organizer");
  expect(view.data.publications).toBeNull();
  const { ctx, page } = await open(browser);
  await signIn(page, "sarah@orasso.local");
  await go(page, "/u/Marc_66");
  await expect(page.getByTestId("profil-tabs").getByRole("tab")).toHaveText(
    [/^Garage · \d+$/, "Sorties", "Publications"],
    {
      timeout: 30_000,
    },
  );
  // Hors audience limitée, un compteur nul ouvre « Garage » ; le panneau « Compte privé » est dans « Publications ».
  await expect(selected(page)).toHaveAccessibleName(/^Garage/);
  await expect(page.getByTestId("publications-private")).toHaveCount(0);
  await page.getByTestId("profil-tab-publications").click();
  await expect(page.getByTestId("publications-private")).toContainText("Compte privé");
  await page.getByTestId("profil-tab-sorties").click();
  await expect(selected(page)).toHaveAccessibleName("Sorties");
  // Un paramètre d'onglet invalide est ignoré : l'ouverture suit la règle.
  await go(page, "/u/Kenji_66?onglet=nimporte");
  await expect(selected(page)).toHaveAccessibleName("Publications");
  await ctx.close();
});

test("commentaires (R8k2) : la publication seule a sa ligne flamme · commentaire · partager, `?commentaires=1` ouvre la feuille, « Couper les commentaires » est au menu", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const kenji = await login("kenji@orasso.local");
  const id = await publishApi(kenji, `Pour les commentaires ${unique()}`);
  const { ctx, page } = await open(browser);
  await signIn(page, "kenji@orasso.local");
  await go(page, `/publication/${id}`);
  await expect(page.getByTestId("feed-post-comment")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("feed-post-fire")).toBeVisible();
  await expect(page.getByTestId("feed-post-share")).toBeVisible();
  await expect(page.getByTestId("feed-comments-sheet")).toHaveCount(0);
  await go(page, `/publication/${id}?commentaires=1`);
  await expect(page.getByTestId("feed-comments-sheet")).toBeVisible({ timeout: 30_000 });
  await go(page, `/publication/${id}`);
  await page.getByTestId("feed-card-more").click();
  await page.getByTestId("publication-menu-comments").click();
  await expect
    .poll(async () => (await apiCall<{ commentsOff: boolean }>(kenji, "GET", `/feed-posts/${id}`)).data.commentsOff)
    .toBe(true);
  await apiCall(kenji, "DELETE", `/me/feed-posts/${id}`);
  await ctx.close();
});

test("commentaires (R8k2) : la feuille s'ouvre depuis une carte de « Une par une » sur mon profil", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const { ctx, page } = await open(browser);
  await signIn(page, "kenji@orasso.local");
  await go(page, "/profil");
  await expect(page.getByTestId("publications-grid")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Une par une" }).click();
  await page.getByTestId("feed-post-comment").first().click();
  await expect(page.getByTestId("feed-comments-sheet")).toBeVisible({ timeout: 30_000 });
  await page
    .getByRole("button", { name: "Grille de deux" })
    .click()
    .catch(() => undefined);
  await ctx.close();
});

test("hors ligne : mon onglet montre la dernière copie, se recharge au retour du réseau ; le profil d'un autre n'est jamais gardé", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser);
  await signIn(page, "kenji@orasso.local");
  await go(page, "/profil");
  await expect(page.getByTestId("publications-grid")).toBeVisible({ timeout: 30_000 });
  const n = await page.getByTestId("publication-tile").count();
  await page.waitForTimeout(1500); // la copie est écrite après la lecture
  // L'API ne répond plus : la copie s'affiche, même ancienne, avec la phrase de l'Accueil hors ligne.
  await ctx.route("**/api/authors/**", (route) => route.abort());
  await go(page, "/profil");
  await expect(page.getByTestId("publications-offline")).toContainText(
    "Hors ligne : voici ce que ton téléphone a gardé.",
    {
      timeout: 30_000,
    },
  );
  await expect(page.getByTestId("publication-tile")).toHaveCount(n);
  await shot(page, "hors-ligne");
  // Retour du réseau : la liste se recharge seule.
  await ctx.setOffline(true);
  await ctx.unroute("**/api/authors/**");
  await ctx.setOffline(false);
  await expect(page.getByTestId("publications-offline")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("publication-tile")).toHaveCount(n);
  // Le profil d'un autre n'est jamais gardé : sans réseau, une erreur et « Réessayer », jamais sa liste.
  await ctx.route("**/api/authors/**", (route) => route.abort());
  await go(page, "/u/Lea_11?onglet=publications");
  await expect(page.getByTestId("publication-tile")).toHaveCount(0);
  await go(page, "/u/Damien_66");
  await expect(page.getByTestId("publications-offline")).toHaveCount(0);
  await expect(page.getByTestId("publication-tile")).toHaveCount(0);
  await ctx.close();
});

test("profil vide → Publier → retour : la nouvelle publication est là (la liste se relit au retour)", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const pseudo = `Retour_${unique()}`.slice(0, 18);
  const cookie = await signUpApi(pseudo);
  const { ctx, page } = await open(browser);
  await signIn(page, `${pseudo.toLowerCase()}@e2e.orasso.test`);
  await go(page, "/profil");
  await expect(page.getByTestId("publications-empty")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("publications-publish").click();
  await expect(page).toHaveURL(/fil\/publier/, { timeout: 30_000 });
  // La publication part (ici par l'API) pendant que l'écran « Publier » est ouvert, puis retour sur le profil.
  await publishApi(cookie, `Première photo ${unique()}`);
  await page.goBack();
  await expect(page.getByTestId("publication-tile")).toHaveCount(1, { timeout: 30_000 });
  await expect(page.getByTestId("publications-empty")).toHaveCount(0);
  await ctx.close();
});
