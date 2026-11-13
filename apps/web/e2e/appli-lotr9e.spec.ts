import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { cutWords } from "./cutWords";
import { apiCall, login, SEED_PASSWORD, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot R9e (albums des médias), côté appli (version web compilée de recette, `APP_URL`) : Léo (Sud Cars) crée un album en trois étapes
// (événement accrédité, trois photos dont une avec un cadre de plaque posé à la main, « Flouter et ajouter », titre, « Enregistrer »
// autorisé), le publie, le retrouve dans « Albums » de sa Page ; Damien le voit dans son Fil (carte, « Voir l'album »), sur l'album ouvert
// (sans gestion) et sur la Page de Sud Cars ; le brouillon du seed se reprend, l'accréditation en attente est grisée, la galerie reprise de
// Béziers Night s'ouvre avec ses 4 photos ; la police ×1,3 tient dans les trois étapes et dans l'album ouvert.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r9e-captures/apres/recette-appli`;
const PHOTOS = resolve(import.meta.dirname, "../../api/scripts/seed/assets/photos");
const photo = (name: string) => ({ name, mimeType: "image/jpeg", buffer: readFileSync(`${PHOTOS}/${name}`) });
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

const LEO = "leo@orasso.local";
const DAMIEN = "damien@orasso.local";

type Summary = { id: string; title: string; photosCount: number; media: { key: string }; event: { slug: string } };

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string, opts: { theme?: string; scale?: number; width?: number } = {}) {
  const { theme = "beton", scale = 1, width = 390 } = opts;
  const ctx = await browser.newContext({ viewport: { width, height: 860 }, baseURL: APP });
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
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

/** La casquette Média : la ligne « Média · Sud Cars » de Mon profil ouvre sa barre. */
async function wearMedia(page: Page) {
  await go(page, "/moi");
  await page.getByTestId("casquette-media").first().click();
  await page.waitForURL((u) => !/\/(moi|profil)(\?|$)/.test(u.pathname), { timeout: 30_000 });
  await expect(page.getByTestId("persona-tabbar")).toBeVisible({ timeout: 30_000 });
}
const pageTab = (page: Page) => page.getByTestId("persona-tabbar").getByRole("tab", { name: "Page", exact: true });

async function mine(status: "published" | "draft") {
  const cookie = await login(LEO);
  const list = await apiCall<{ items: Summary[] }>(cookie, "GET", `/me/albums?status=${status}&limit=100`);
  return { cookie, items: list.data.items };
}

async function noOverflow(page: Page, width: number) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const box = await page.getByTestId("album-step-label").boundingBox().catch(() => null);
  if (box) expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
}

test("Léo crée un album en trois étapes, le publie ; Damien le voit dans son Fil, sur l'album et sur la Page", async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const title = `Béziers Night R9e ${unique()}`;
  let albumId: string | null = null;
  const leo = await open(browser, LEO);
  const page = leo.page;
  try {
    await wearMedia(page);
    await pageTab(page).click();
    // « Albums » : « Nouvel album » (le seul bouton principal), les albums du seed (le brouillon porte « Brouillon »), « Liens ».
    await expect(page.getByTestId("page-tab-albums")).toContainText("Albums", { timeout: 30_000 });
    await expect(page.getByTestId("page-album-new")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("page-album").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("page-album").filter({ hasText: "Béziers Night en images" })).toBeVisible();
    await shot(page, "page-albums-leo");
    await page.getByTestId("page-album-new").click();

    // Étape 1 : seulement les événements où le média est accrédité ; l'accréditation en attente est grisée.
    await expect(page.getByTestId("album-step-label")).toHaveText("Étape 1 sur 3", { timeout: 30_000 });
    await expect(page.getByTestId("album-event")).toHaveCount(3);
    await expect(page.getByTestId("album-event-pending")).toHaveCount(1);
    await expect(page.getByTestId("album-event-pending")).toContainText("C&C Perpignan");
    await expect(page.getByTestId("album-events-note")).toBeVisible();
    await shot(page, "nouvel-album-1");
    await page.getByTestId("album-event").filter({ hasText: "Béziers Night" }).click();
    await page.getByTestId("album-step1-continue").click();

    // Étape 2 : trois photos, un cadre de plaque posé à la main (le navigateur n'a pas de détecteur), une décision pour le lot.
    await expect(page.getByTestId("album-step-label")).toHaveText("Étape 2 sur 3", { timeout: 30_000 });
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("album-pick").click();
    await (await chooser).setFiles([photo("car-golf-gti.jpg"), photo("car-mx5.jpg"), photo("car-supra.jpg")]);
    await expect(page.getByTestId("album-tile")).toHaveCount(3, { timeout: 30_000 });
    await expect(page.getByTestId("album-plates")).toHaveCount(0);
    await page.getByTestId("album-tile").first().click();
    await expect(page.getByTestId("album-frame-editor")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("album-frame-add").click();
    await page.getByTestId("album-frame-done").click();
    await expect(page.getByTestId("album-plates")).toContainText("1 photo avec une plaque repérée");
    await expect(page.getByTestId("album-step2-continue")).toBeDisabled();
    await expect(page.getByTestId("album-needs-decision")).toBeVisible();
    await shot(page, "nouvel-album-2");
    await page.getByTestId("album-blur").click();
    await expect(page.getByTestId("album-plates")).toContainText("1 photo floutée");
    await page.getByTestId("album-change").click();
    await expect(page.getByTestId("album-blur")).toBeVisible();
    await page.getByTestId("album-blur").click();
    await page.getByTestId("album-step2-continue").click();

    // Étape 3 : titre, « Enregistrer » autorisé, ce que verront les autres, « Publier l'album ».
    await expect(page.getByTestId("album-step-label")).toHaveText("Étape 3 sur 3", { timeout: 90_000 });
    await page.getByTestId("album-title").fill(title);
    await expect(page.getByTestId("album-line-credit")).toContainText("Photos : Sud Cars");
    await expect(page.getByTestId("album-line-event")).toContainText("Béziers Night");
    await expect(page.getByTestId("album-line-photos")).toContainText("3 photos");
    await page.getByTestId("album-allow-save").click();
    await expect(page.getByTestId("album-preview")).toContainText(title);
    await shot(page, "nouvel-album-3");
    await page.getByTestId("album-publish").click();

    // L'album ouvert : titre, tags, événement, emplacement de R9f vide, grille de photos, visionneuse avec le crédit.
    await expect(page.getByTestId("album-open-title")).toHaveText(title, { timeout: 60_000 });
    albumId = page.url().match(/\/album\/([0-9a-f-]{36})/)?.[1] ?? null;
    await expect(page.getByTestId("album-tag-count")).toHaveText("3 photos");
    await expect(page.getByTestId("album-tag-credit")).toHaveText("Photos : Sud Cars");
    await expect(page.getByTestId("album-tag-official")).toHaveCount(0);
    await expect(page.getByTestId("album-event-link")).toContainText("présent au Béziers Night");
    await expect(page.getByTestId("album-identify-slot")).toBeAttached();
    await expect(page.getByTestId("album-photo")).toHaveCount(3);
    await shot(page, "album-ouvert-leo");
    await page.getByTestId("album-photo").first().click();
    await expect(page.getByTestId("album-viewer")).toBeVisible();
    await expect(page.getByTestId("album-viewer-count")).toContainText("1");
    await expect(page.getByTestId("album-viewer-credit")).toContainText("Photos : Sud Cars");
    await page.getByTestId("album-viewer-close").click();
    const created = (await mine("published")).items.find((a) => a.id === albumId);
    expect(created).toMatchObject({ title, photosCount: 3 });

    // Sa Page : l'album est dans « Albums », les compteurs « albums · photos » comptent.
    await wearMedia(page);
    await pageTab(page).click();
    await expect(page.getByTestId("page-album").filter({ hasText: title })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("page-count-albums")).toBeVisible();
    await expect(page.getByTestId("page-count-photos")).toBeVisible();
    await expect(page.getByTestId("page-count-accreditations")).toHaveCount(0);

    // Damien : la carte « album » dans son Fil (« Voir l'album », ni flamme ni commentaire), l'album sans gestion, la Page de Sud Cars.
    const damien = await open(browser, DAMIEN);
    const d = damien.page;
    await go(d, "/fil");
    await d.getByRole("tab", { name: "Abonnements", exact: true }).click();
    const card = d.getByTestId("feed-card-album").filter({ hasText: title }).first();
    await expect(card).toBeVisible({ timeout: 60_000 });
    await expect(card).toContainText("Sud Cars");
    await expect(card).toContainText("3 photos");
    await expect(card.getByTestId("feed-album-open")).toBeVisible();
    await expect(card.getByTestId("feed-album-title")).toContainText(title);
    await shot(d, "fil-carte-album");
    await card.getByTestId("feed-album-open").click();
    await expect(d.getByTestId("album-open-title")).toHaveText(title, { timeout: 30_000 });
    await d.getByTestId("album-more").click();
    await expect(d.getByTestId("album-report")).toBeVisible();
    await expect(d.getByTestId("album-delete")).toHaveCount(0);
    await expect(d.getByTestId("album-edit-title")).toHaveCount(0);
    const sud = created?.media.key.slice(2);
    await go(d, `/m/${sud}`);
    await expect(d.getByTestId("page-name")).toContainText("Sud Cars", { timeout: 30_000 });
    await expect(d.getByTestId("page-album").filter({ hasText: title })).toBeVisible({ timeout: 30_000 });
    await expect(d.getByTestId("page-album-new")).toHaveCount(0);
    await damien.ctx.close();
  } finally {
    await leo.ctx.close();
    if (albumId) await apiCall(await login(LEO), "DELETE", `/me/albums/${albumId}`);
  }
});

test("le brouillon du seed se reprend ; la galerie reprise de Béziers Night s'ouvre avec ses 4 photos", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, LEO);
  await go(page, "/album/nouveau");
  await expect(page.getByTestId("album-event-pending")).toHaveCount(1, { timeout: 30_000 });
  await page.getByTestId("album-event").filter({ hasText: "Nocturne de Canet" }).click();
  await expect(page.getByTestId("album-step1-continue")).toContainText("Reprendre l'album");
  await page.getByTestId("album-step1-continue").click();
  await expect(page.getByTestId("album-step-label")).toHaveText("Étape 2 sur 3", { timeout: 30_000 });
  await expect(page.getByTestId("album-count")).toContainText("3");
  const published = await mine("published");
  const beziers = published.items.find((a) => a.title === "Béziers Night en images");
  expect(beziers).toMatchObject({ photosCount: 4 });
  await go(page, `/album/${beziers?.id}`);
  await expect(page.getByTestId("album-open-title")).toHaveText("Béziers Night en images", { timeout: 30_000 });
  await expect(page.getByTestId("album-tag-count")).toHaveText("4 photos");
  await expect(page.getByTestId("album-photo")).toHaveCount(4);
  await ctx.close();
});

test("police ×1,3 : les trois étapes et l'album ouvert tiennent, aucun mot coupé, aucune page qui déborde", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { ctx, page } = await open(browser, LEO, { scale: 1.3, width: 384 });
  await go(page, "/album/nouveau");
  await expect(page.getByTestId("album-step-label")).toHaveText("Étape 1 sur 3", { timeout: 30_000 });
  await expect(page.getByTestId("album-event").first()).toBeVisible();
  expect(await cutWords(page, "album-event")).toEqual([]);
  await noOverflow(page, 384);
  await shot(page, "x13-etape-1");
  await page.getByTestId("album-event").filter({ hasText: "Nocturne de Canet" }).click();
  await page.getByTestId("album-step1-continue").click();
  await expect(page.getByTestId("album-step-label")).toHaveText("Étape 2 sur 3", { timeout: 30_000 });
  await expect(page.getByTestId("album-count")).toContainText("3");
  await noOverflow(page, 384);
  await shot(page, "x13-etape-2");
  // Les trois photos du brouillon sont déjà dans l'album : « Continuer » mène aux détails.
  await page.getByTestId("album-step2-continue").click();
  await expect(page.getByTestId("album-step-label")).toHaveText("Étape 3 sur 3", { timeout: 60_000 });
  expect(await cutWords(page, "album-line-credit")).toEqual([]);
  expect(await cutWords(page, "album-line-event")).toEqual([]);
  await noOverflow(page, 384);
  await shot(page, "x13-etape-3");
  const published = await mine("published");
  const rassemblement = published.items.find((a) => a.title === "Les photos du Rassemblement Côte Vermeille");
  expect(rassemblement).toBeTruthy();
  await go(page, `/album/${rassemblement?.id}`);
  await expect(page.getByTestId("album-open-title")).toContainText("Rassemblement", { timeout: 30_000 });
  expect(await cutWords(page, "album-open-title")).toEqual([]);
  expect(await cutWords(page, "album-tag-count")).toEqual([]);
  await noOverflow(page, 384);
  await shot(page, "x13-album-ouvert");
  await ctx.close();
});
