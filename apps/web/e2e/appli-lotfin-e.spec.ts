import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, SEED_PASSWORD, unique } from "./helpers";
import { type R5Crew, r5Crew } from "./lotr5c2-setup";
import { postText } from "./lotr6a-setup";
import { RELAIS } from "./relais";

// Petit lot de fin, partie E (option B « Comme le Profil » choisie par Damien le 13/11), côté appli (version web compilée de
// recette) : le haut compact de l'onglet Crew. Vignette de la couverture (le logo dans son coin ; elle ouvre la couverture en
// grand avec la description, « Signaler » pour un membre), nom jamais tronqué (▾ quand j'ai plusieurs crews), « N membres · tu es
// le chef », description sur une ligne avec « plus » (elle se déplie avec l'Instagram), Inviter et Réglages empilés (chef),
// Discussion pleine largeur, onglets collants avec « Publier » en icône au bout. Mesure : le y du premier contenu du fil à
// 384 × 844 ne dépasse pas 300 px à ×1 ni 320 px à ×1,3 (la maquette donne 286 et 305). Lancer avec APP_URL, API seedée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-fin-e-captures/apres/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

/** Les plafonds de la fiche (la maquette : 286 à ×1, 305 à ×1,3, avec une marge pour le rendu réel). */
const MAX_Y_X1 = 300;
const MAX_Y_X13 = 320;

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string, theme = "beton", scale = 1) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 844 }, baseURL: APP });
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

async function go(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
  await expect(page.getByTestId("crew-tabs")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1_000);
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function box(page: Page, id: string) {
  const b = await page.getByTestId(id).first().boundingBox();
  expect(b, id).not.toBeNull();
  return b as { x: number; y: number; width: number; height: number };
}

/** Un crew de recette avec un fil bien plus long que l'écran (le collant des onglets se vérifie en défilant). */
async function longCrew(posts = 8): Promise<R5Crew> {
  const crew = await r5Crew(unique());
  for (let i = 1; i <= posts; i += 1) {
    await postText(crew, crew.chef, `Publication n° ${i} : rendez-vous au parking de la cave coopérative de Thuir à 9 h.`);
  }
  return crew;
}

test("chef : le haut compact, la mesure à ×1 et le « plus » avec l'Instagram", async ({ browser }) => {
  test.setTimeout(240_000);
  const crew = await longCrew();
  const { ctx, page } = await open(browser, crew.chef.email);
  await go(page, `/crew?crew=${crew.slug}`);
  await expect(page.getByTestId("crew-head")).toBeVisible();
  // La vignette de la couverture, le nom entier, « N membres · tu es le chef ».
  await expect(page.getByTestId("crew-cover-open")).toBeVisible();
  await expect(page.getByTestId("crew-name")).toHaveText(crew.name);
  await expect(page.getByTestId("crew-sub")).toHaveText("2 membres · tu es le chef");
  // Un seul crew : le nom seul, pas de chevron ni de sélecteur.
  await expect(page.getByTestId("crew-selector")).toHaveCount(0);
  await expect(page.getByTestId("crew-selector-single")).toBeVisible();
  // Inviter et Réglages empilés à droite de la ligne (même colonne, Inviter au-dessus).
  const invite = await box(page, "crew-invite");
  const settings = await box(page, "crew-settings");
  expect(Math.abs(invite.x - settings.x)).toBeLessThan(2);
  expect(invite.y + invite.height).toBeLessThanOrEqual(settings.y + 1);
  const thumb = await box(page, "crew-cover-open");
  expect(invite.x).toBeGreaterThan(thumb.x + thumb.width);
  // Discussion : pleine largeur, sous la ligne.
  const disc = await box(page, "crew-discussion");
  expect(disc.width).toBeGreaterThan(300);
  expect(disc.y).toBeGreaterThan(thumb.y + thumb.height - 1);
  // Onglets soulignés et « Publier » (icône moutarde) au bout de la même rangée.
  const tabs = await box(page, "crew-tabs");
  const pub = await box(page, "crew-feed-publish");
  expect(pub.x).toBeGreaterThan(tabs.x + tabs.width - 4);
  expect(Math.abs(pub.y + pub.height / 2 - (tabs.y + tabs.height / 2))).toBeLessThan(tabs.height);
  await expect(page.getByTestId("crew-feed-publish")).not.toContainText("Publier");
  // L'ancien composeur du haut du fil a disparu.
  await expect(page.getByText("Une photo, un mot")).toHaveCount(0);
  // La mesure : le premier contenu du fil.
  const feed = await box(page, "crew-feed");
  expect(feed.y, `premier contenu du fil à ${feed.y} px`).toBeLessThanOrEqual(MAX_Y_X1);
  await shot(page, "chef-repos-384-x1");
  // « plus » déplie la description sur place, avec l'Instagram ; « moins » la replie.
  await expect(page.getByTestId("crew-description")).toBeVisible();
  await expect(page.getByTestId("crew-instagram")).toHaveCount(0);
  await page.getByTestId("crew-description-toggle").click();
  await expect(page.getByTestId("crew-instagram")).toBeVisible();
  await expect(page.getByTestId("crew-instagram")).toContainText("roussillondrift");
  await shot(page, "chef-plus-384-x1");
  await page.getByTestId("crew-description-toggle").click();
  await expect(page.getByTestId("crew-instagram")).toHaveCount(0);
  // La vignette ouvre la couverture en grand, avec la description ; le chef n'y signale pas son crew.
  await page.getByTestId("crew-cover-open").click();
  await expect(page.getByTestId("crew-cover-description")).toBeVisible();
  await expect(page.getByTestId("crew-cover-description")).toContainText("Glisse, japonaises");
  await expect(page.getByTestId("crew-cover-instagram")).toBeVisible();
  await expect(page.getByTestId("report-open-crew")).toHaveCount(0);
  await shot(page, "chef-vignette-384-x1");
  await ctx.close();
});

test("« Publier » au bout des onglets ouvre la publication dans le crew", async ({ browser }) => {
  test.setTimeout(180_000);
  const crew = await r5Crew(unique());
  const { ctx, page } = await open(browser, crew.chef.email);
  await go(page, `/crew?crew=${crew.slug}`);
  await page.getByTestId("crew-tab-members").click();
  // Sur un autre onglet aussi : le bouton est de la rangée, pas du fil.
  await page.getByTestId("crew-feed-publish").click();
  await page.waitForURL(/crew\/publier/, { timeout: 30_000 });
  await ctx.close();
});

test("×1,3 : le premier contenu reste haut, le nom et la rangée d'onglets ne se coupent pas", async ({ browser }) => {
  test.setTimeout(240_000);
  const crew = await longCrew(3);
  const { ctx, page } = await open(browser, crew.chef.email, "sable", 1.3);
  await go(page, `/crew?crew=${crew.slug}`);
  await expect(page.getByTestId("crew-name")).toHaveText(crew.name);
  const feed = await box(page, "crew-feed");
  expect(feed.y, `premier contenu du fil à ${feed.y} px à ×1,3`).toBeLessThanOrEqual(MAX_Y_X13);
  // Les onglets défilent de côté (quatre onglets et « Publier » à ×1,3) : aucun ne déborde de l'écran.
  const row = await page.getByTestId("crew-tabs").evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(row.client).toBeLessThanOrEqual(384);
  const pub = await box(page, "crew-feed-publish");
  expect(pub.x + pub.width).toBeLessThanOrEqual(384);
  await shot(page, "chef-repos-384-x13-sable");
  await ctx.close();
});

test("un nom long passe à la ligne, jamais tronqué", async ({ browser }) => {
  test.setTimeout(240_000);
  const crew = await r5Crew(unique());
  const long = "Pilotes du Dimanche de Canet-Roussillon";
  expect((await apiCall(crew.chef.cookie, "PATCH", `/crews/${crew.id}`, { name: long })).status).toBe(200);
  const { ctx, page } = await open(browser, crew.chef.email);
  await go(page, `/crew?crew=${crew.slug}`);
  await expect(page.getByTestId("crew-name")).toHaveText(long);
  const name = await box(page, "crew-name");
  expect(name.height, "le nom tient sur plusieurs lignes").toBeGreaterThan(40);
  const clipped = await page.getByTestId("crew-name").evaluate((el) => el.scrollHeight > el.clientHeight + 1);
  expect(clipped).toBe(false);
  await shot(page, "chef-nom-long-384-x1");
  await ctx.close();
});

test("membre : ni Inviter ni Réglages, « Signaler » dans la feuille de la couverture", async ({ browser }) => {
  test.setTimeout(240_000);
  const crew = await longCrew(2);
  const { ctx, page } = await open(browser, crew.lea.email);
  await go(page, `/crew?crew=${crew.slug}`);
  await expect(page.getByTestId("crew-sub")).toHaveText("2 membres · tu es membre");
  await expect(page.getByTestId("crew-invite")).toHaveCount(0);
  await expect(page.getByTestId("crew-settings")).toHaveCount(0);
  await expect(page.getByTestId("crew-discussion")).toBeVisible();
  // « Signaler » n'est plus au bas de l'espace : il est dans la feuille de la couverture.
  await expect(page.getByTestId("report-open-crew")).toHaveCount(0);
  const feed = await box(page, "crew-feed");
  expect(feed.y, `premier contenu du fil à ${feed.y} px (membre)`).toBeLessThanOrEqual(MAX_Y_X1);
  await shot(page, "membre-repos-384-x1");
  await page.getByTestId("crew-cover-open").click();
  await expect(page.getByTestId("report-open-crew")).toBeVisible();
  await shot(page, "membre-vignette-384-x1");
  await ctx.close();
});

test("les onglets restent collés en haut au défilement, « Publier » avec eux", async ({ browser }) => {
  test.setTimeout(240_000);
  const crew = await longCrew(10);
  const { ctx, page } = await open(browser, crew.chef.email);
  await go(page, `/crew?crew=${crew.slug}`);
  await expect(page.getByTestId("crew-post").first()).toBeVisible({ timeout: 30_000 });
  const tall = await page.getByTestId("crew-tab").evaluate((el) => el.scrollHeight / el.clientHeight);
  expect(tall, "le fil est bien plus long que l'écran").toBeGreaterThan(1.8);
  const before = await box(page, "crew-tabs");
  await page.getByTestId("crew-tab").evaluate((el) => {
    el.scrollTop = 900;
  });
  await page.waitForTimeout(500);
  const after = await box(page, "crew-tabs");
  const pub = await box(page, "crew-feed-publish");
  expect(after.y, "la rangée est restée en haut de la zone qui défile").toBeLessThan(before.y);
  expect(after.y).toBeLessThan(160);
  expect(pub.y).toBeLessThan(160);
  // Le haut du crew (couverture, nom) est parti.
  await expect(page.getByTestId("crew-cover-open")).not.toBeInViewport();
  await shot(page, "chef-defile-384-x1");
  await ctx.close();
});

test("plusieurs crews : le nom ▾ ouvre « Mes crews », le rôle reste sous le nom", async ({ browser }) => {
  test.setTimeout(180_000);
  const { ctx, page } = await open(browser, "theo@orasso.local");
  await go(page, "/crew");
  await expect(page.getByTestId("crew-selector")).toBeVisible({ timeout: 30_000 });
  // Le rôle reste sous le nom : « N membres · tu es membre » (plus « 2 autres crews »).
  await expect(page.getByTestId("crew-sub")).toHaveText(/membres? · tu es (membre|le chef)/);
  await expect(page.getByTestId("crew-sub")).not.toContainText("autre");
  await page.getByTestId("crew-selector").click();
  await expect(page.getByTestId("crew-selector-list")).toBeVisible();
  await expect(page.getByTestId("crew-choice-more")).toBeVisible();
  await shot(page, "multi-selecteur-384-x1");
  await ctx.close();
});
