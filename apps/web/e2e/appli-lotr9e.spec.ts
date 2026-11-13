import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { cutWords } from "./cutWords";
import { apiCall, login, SEED_PASSWORD, unique } from "./helpers";
import { sql } from "./helpers/lot48";
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
  const box = await page
    .getByTestId("album-step-label")
    .boundingBox()
    .catch(() => null);
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
    await page.getByTestId("page-tab-albums").click();
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
    await page.getByTestId("page-tab-albums").click();
    await expect(page.getByTestId("page-album").filter({ hasText: title })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("page-count-albums")).toBeVisible();
    await expect(page.getByTestId("page-count-photos")).toBeVisible();
    await expect(page.getByTestId("page-count-accreditations")).toHaveCount(0);

    // Damien : la carte « album » dans son Fil (« Voir l'album », ni flamme ni commentaire), l'album sans gestion, la Page de Sud Cars.
    // Les cartes déjà montrées à Damien par une passe précédente ne reviennent pas (« Déjà vu ») : son Fil repart de neuf (lui seul : les autres comptes ne sont pas touchés).
    await sql(`delete from feed_seen where user_id = (select id from "user" where email = 'damien@orasso.local')`);
    await sql(
      `delete from feed_seen_floor where user_id = (select id from "user" where email = 'damien@orasso.local')`,
    );
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
    // « Signaler » vit dans la visionneuse (sur la photo affichée) ; Damien n'a pas « Retirer ».
    await d.getByTestId("album-photo").nth(1).click();
    await expect(d.getByTestId("album-viewer-report")).toBeVisible();
    await expect(d.getByTestId("album-viewer-remove")).toHaveCount(0);
    await d.getByTestId("album-viewer-close").click();
    await d.getByTestId("album-more").click();
    await expect(d.getByTestId("album-report")).toHaveCount(0);
    await expect(d.getByTestId("album-delete")).toHaveCount(0);
    await expect(d.getByTestId("album-edit-title")).toHaveCount(0);
    const sud = created?.media.key.slice(2);
    await go(d, `/m/${sud}`);
    await expect(d.getByTestId("page-name")).toContainText("Sud Cars", { timeout: 30_000 });
    await d.getByTestId("page-tab-albums").click();
    await expect(d.getByTestId("page-album").filter({ hasText: title })).toBeVisible({ timeout: 30_000 });
    await expect(d.getByTestId("page-album-new")).toHaveCount(0);
    await damien.ctx.close();

    // Le titulaire retire une photo depuis la visionneuse (la visionneuse se ferme, la confirmation s'ouvre, l'album garde les deux autres).
    await go(page, `/album/${albumId}`);
    await page.getByTestId("album-photo").first().click();
    await expect(page.getByTestId("album-viewer-report")).toHaveCount(0);
    await page.getByTestId("album-viewer-remove").click();
    await expect(page.getByTestId("album-viewer")).toHaveCount(0, { timeout: 10_000 });
    await page.getByTestId("orga-confirm").click();
    await expect(page.getByTestId("album-photo")).toHaveCount(2, { timeout: 30_000 });
    await expect(page.getByTestId("album-tag-count")).toHaveText("2 photos");
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

// --- Tour 1 (corrections des relectures Opus et Codex) -----------------------------------------------------------------------------

const DROP_BEZIERS_DRAFTS =
  "delete from event_albums where status = 'draft' and event_id = (select id from events where slug = 'beziers-night-2026')";

async function openBeziersStep2(browser: Browser, opts: { scale?: number; width?: number } = {}) {
  await sql(DROP_BEZIERS_DRAFTS);
  const leo = await open(browser, LEO, opts);
  await go(leo.page, "/album/nouveau");
  await expect(leo.page.getByTestId("album-event").first()).toBeVisible({ timeout: 30_000 });
  await leo.page.getByTestId("album-event").filter({ hasText: "Béziers Night" }).click();
  await leo.page.getByTestId("album-step1-continue").click();
  await expect(leo.page.getByTestId("album-step-label")).toHaveText("Étape 2 sur 3", { timeout: 30_000 });
  return leo;
}

async function pickPhotos(page: Page, names: string[]) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("album-pick").click();
  await (await chooser).setFiles(names.map(photo));
}

/** Pose un cadre de plaque à la main sur la tuile `n` (le navigateur n'a pas de détecteur) : la tuile s'ouvre, « Poser un cadre », « Terminé ». */
async function frameTile(page: Page, n: number) {
  await page.getByTestId("album-tile").nth(n).click();
  await expect(page.getByTestId("album-frame-editor")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("album-frame-add").click();
  await page.getByTestId("album-frame-done").click();
}

test("la décision de plaque est par photo : une photo à plaque ajoutée après coup rouvre le bloc pour elle, les premières gardent la leur", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const leo = await openBeziersStep2(browser);
  const page = leo.page;
  try {
    await pickPhotos(page, ["car-golf-gti.jpg", "car-mx5.jpg"]);
    await expect(page.getByTestId("album-tile")).toHaveCount(2, { timeout: 30_000 });
    await frameTile(page, 0);
    await frameTile(page, 1);
    await expect(page.getByTestId("album-plates")).toContainText("2 photos avec une plaque repérée");
    await page.getByTestId("album-keep").click();
    await expect(page.getByTestId("album-plates")).toContainText("2 photos gardées telles quelles");
    // Une troisième photo à plaque : le bloc se rouvre pour elle seule, « Continuer » attend sa décision.
    await pickPhotos(page, ["car-supra.jpg"]);
    await expect(page.getByTestId("album-tile")).toHaveCount(3, { timeout: 30_000 });
    await frameTile(page, 2);
    await expect(page.getByTestId("album-plates")).toContainText("1 photo avec une plaque repérée");
    await expect(page.getByTestId("album-plates")).toContainText("2 photos gardées telles quelles");
    await expect(page.getByTestId("album-step2-continue")).toBeDisabled();
    await page.getByTestId("album-blur").click();
    await expect(page.getByTestId("album-plates")).toContainText("1 photo floutée");
    await expect(page.getByTestId("album-plates")).toContainText("2 photos gardées telles quelles");
    await expect(page.getByTestId("album-step2-continue")).toBeEnabled();
    // Le badge de la feuille d'une photo gardée telle quelle ne dit jamais « floutée ».
    await page.getByTestId("album-tile").first().click();
    await expect(page.getByTestId("album-frame-editor")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("album-frame-editor")).toContainText("Envoyée telle quelle");
    await expect(page.getByTestId("album-frame-editor")).not.toContainText("floutée");
  } finally {
    await leo.ctx.close();
    await sql(DROP_BEZIERS_DRAFTS);
  }
});

test("réponse perdue après « telle quelle » : « Changer » ne rouvre rien, la reprise rejoue la même décision, la photo reste « telle quelle »", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const leo = await openBeziersStep2(browser);
  const page = leo.page;
  try {
    // Le serveur a validé l'ajout, la réponse se perd.
    let lost = 0;
    await page.route("**/api/me/albums/*/photos", async (route) => {
      if (route.request().method() === "POST" && lost++ === 0) {
        await route.fetch();
        await route.abort();
      } else await route.continue();
    });
    await pickPhotos(page, ["car-golf-gti.jpg"]);
    await expect(page.getByTestId("album-tile")).toHaveCount(1, { timeout: 30_000 });
    await frameTile(page, 0);
    await page.getByTestId("album-keep").click();
    await page.getByTestId("album-step2-continue").click();
    await expect(page.getByTestId("album-send-error")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("album-step2-continue")).toContainText("Reprendre l'envoi");
    // L'ajout est parti : « Changer » a disparu, la feuille de la photo dit que sa décision est figée.
    await expect(page.getByTestId("album-change")).toHaveCount(0);
    await page.getByTestId("album-tile").first().click();
    await expect(page.getByTestId("album-decision-frozen")).toBeVisible();
    await expect(page.getByTestId("album-frame-editor")).toHaveCount(0);
    // On ferme la feuille en touchant l'arrière-plan, au-dessus d'elle.
    await page.mouse.click(195, 30);
    await expect(page.getByTestId("album-decision-frozen")).toHaveCount(0);
    // La reprise rejoue le même clientId avec la même décision.
    await page.getByTestId("album-step2-continue").click();
    await expect(page.getByTestId("album-step-label")).toHaveText("Étape 3 sur 3", { timeout: 90_000 });
    const rows = await sql<{ plate_state: string }>(
      "select p.plate_state from event_album_photos p join event_albums a on a.id = p.album_id join events e on e.id = a.event_id where e.slug = 'beziers-night-2026' and a.status = 'draft' and p.deleted_at is null",
    );
    expect(rows.map((r) => r.plate_state)).toEqual(["kept"]);
    await expect(page.getByTestId("album-line-photos")).toContainText("0 plaque floutée");
  } finally {
    await leo.ctx.close();
    await sql(DROP_BEZIERS_DRAFTS);
  }
});

test("le titre et l'option de l'étape 3 survivent à un aller-retour ; un brouillon repris compte ses photos une fois et se retire", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const leo = await openBeziersStep2(browser);
  const page = leo.page;
  try {
    await pickPhotos(page, ["car-golf-gti.jpg"]);
    await expect(page.getByTestId("album-tile")).toHaveCount(1, { timeout: 30_000 });
    await frameTile(page, 0);
    await page.getByTestId("album-blur").click();
    await page.getByTestId("album-step2-continue").click();
    await expect(page.getByTestId("album-step-label")).toHaveText("Étape 3 sur 3", { timeout: 90_000 });
    await page.getByTestId("album-title").fill("Mon titre choisi");
    await page.getByTestId("album-allow-save").click();
    await page.getByTestId("album-line-photos").click();
    await expect(page.getByTestId("album-step-label")).toHaveText("Étape 2 sur 3");
    // La photo ajoutée montre la version du serveur et ne s'ouvre que pour être retirée.
    await expect(page.getByTestId("album-count")).toContainText("1");
    await page.getByTestId("album-step2-continue").click();
    await expect(page.getByTestId("album-step-label")).toHaveText("Étape 3 sur 3", { timeout: 60_000 });
    await expect(page.getByTestId("album-title")).toHaveValue("Mon titre choisi");
    await expect(page.getByTestId("album-line-photos")).toContainText("1 plaque floutée");
    // Reprise (autre séance) : la photo d'avant est comptée une fois (« 1 »), ses plaques floutées aussi ; elle se retire.
    await go(page, "/album/nouveau");
    await page.getByTestId("album-event").filter({ hasText: "Béziers Night" }).click();
    await expect(page.getByTestId("album-step1-continue")).toContainText("Reprendre l'album");
    await page.getByTestId("album-step1-continue").click();
    await expect(page.getByTestId("album-count")).toContainText("1", { timeout: 30_000 });
    await expect(page.getByTestId("album-tile-base")).toHaveCount(1);
    await page.getByTestId("album-tile-base").click();
    await page.getByTestId("album-photo-remove").click();
    await expect(page.getByTestId("album-tile-base")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("album-count")).toContainText("0");
  } finally {
    await leo.ctx.close();
    await sql(DROP_BEZIERS_DRAFTS);
  }
});

test("« Signaler » vise la photo affichée (la visionneuse se ferme avant la feuille) ; le titulaire retire une photo depuis la visionneuse ; la consultation est comptée", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const published = await mine("published");
  const rassemblement = published.items.find((a) => a.title === "Les photos du Rassemblement Côte Vermeille");
  expect(rassemblement).toBeTruthy();
  const view = await apiCall<{ photos: { id: string }[] }>(await login(DAMIEN), "GET", `/albums/${rassemblement?.id}`);
  const third = view.data.photos[2]?.id;
  expect(third).toBeTruthy();
  const damien = await open(browser, DAMIEN);
  const d = damien.page;
  const views: string[] = [];
  d.on("request", (r) => {
    if (r.method() === "POST" && /\/api\/media-contents\/[^/]+\/view$/.test(r.url())) views.push(r.url());
  });
  let target: { targetType?: string; targetId?: string } | null = null;
  await d.route("**/api/reports", async (route) => {
    target = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ id: crypto.randomUUID() }),
    });
  });
  await go(d, `/album/${rassemblement?.id}`);
  await expect(d.getByTestId("album-photo")).toHaveCount(12, { timeout: 30_000 });
  await d.getByTestId("album-photo").nth(2).click();
  await expect(d.getByTestId("album-viewer")).toBeVisible();
  await expect.poll(() => views.length).toBe(1);
  await d.getByTestId("album-viewer-report").click();
  // La visionneuse se ferme, la feuille de signalement s'ouvre devant l'album.
  await expect(d.getByTestId("album-viewer")).toHaveCount(0, { timeout: 10_000 });
  await d.locator("[data-testid^=report-reason-]").first().click();
  await d.getByTestId("report-send").click();
  await expect.poll(() => target?.targetId).toBe(third);
  expect(target).toMatchObject({ targetType: "album_photo", targetId: third });
  // Ouvrir une autre photo ne compte pas une seconde consultation.
  await d.getByTestId("report-close").click();
  await d.getByTestId("album-photo").nth(3).click();
  expect(views).toHaveLength(1);
  await damien.ctx.close();
});

// --- Tour 2 (opérations idempotentes par clientId, succès prouvé) ------------------------------------------------------------------

const LIVE_PHOTOS =
  "select count(*)::int n from event_album_photos p join event_albums a on a.id = p.album_id join events e on e.id = a.event_id where e.slug = 'beziers-night-2026' and a.status = 'draft' and p.deleted_at is null";

test("retirer AVANT la validation tardive de l'ajout : l'annulation par clientId est gardée côté API, l'ajout tardif est refusé, aucune photo ne reste", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const leo = await openBeziersStep2(browser);
  const page = leo.page;
  try {
    let held: { url: string; body: string } | null = null;
    await page.route("**/api/me/albums/*/photos", async (route) => {
      if (route.request().method() === "POST" && held === null) {
        held = { url: route.request().url(), body: route.request().postData() ?? "" };
        await route.abort();
      } else await route.continue();
    });
    await pickPhotos(page, ["car-golf-gti.jpg"]);
    await expect(page.getByTestId("album-tile")).toHaveCount(1, { timeout: 30_000 });
    await page.getByTestId("album-step2-continue").click();
    await expect(page.getByTestId("album-send-error")).toBeVisible({ timeout: 30_000 });
    // « Retirer » depuis la feuille de la photo (son ajout est parti) : l'annulation est confirmée par l'API.
    const cancelled = page.waitForResponse(
      (r) => r.url().includes("/photos/by-client/") && r.request().method() === "DELETE",
    );
    await page.getByTestId("album-tile").first().click();
    await page.getByTestId("album-photo-remove").click();
    expect((await cancelled).status()).toBe(204);
    await expect(page.getByTestId("album-tile")).toHaveCount(0);
    // La validation tardive arrive : refusée (409).
    const sent = held as { url: string; body: string } | null;
    expect(sent).not.toBeNull();
    const path = new URL((sent as { url: string }).url).pathname.replace(/^\/api/, "");
    const late = await apiCall(await login(LEO), "POST", path, JSON.parse((sent as { body: string }).body));
    expect(late.status).toBe(409);
    expect((await sql<{ n: number }>(LIVE_PHOTOS))[0]?.n).toBe(0);
  } finally {
    await leo.ctx.close();
    await sql(DROP_BEZIERS_DRAFTS);
  }
});

test("deux signalements successifs : le second formulaire est neuf (pas de « Signalement envoyé » hérité) et vise l'autre photo", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const published = await mine("published");
  const rassemblement = published.items.find((a) => a.title === "Les photos du Rassemblement Côte Vermeille");
  const view = await apiCall<{ photos: { id: string }[] }>(await login(DAMIEN), "GET", `/albums/${rassemblement?.id}`);
  const [first, second] = [view.data.photos[0]?.id, view.data.photos[3]?.id];
  const damien = await open(browser, DAMIEN);
  const d = damien.page;
  const targets: string[] = [];
  await d.route("**/api/reports", async (route) => {
    targets.push(route.request().postDataJSON().targetId);
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ id: crypto.randomUUID() }),
    });
  });
  await go(d, `/album/${rassemblement?.id}`);
  await expect(d.getByTestId("album-photo")).toHaveCount(12, { timeout: 30_000 });
  await d.getByTestId("album-photo").first().click();
  await d.getByTestId("album-viewer-report").click();
  await d.locator("[data-testid^=report-reason-]").first().click();
  await d.getByTestId("report-send").click();
  await expect(d.getByTestId("report-done")).toBeVisible();
  await d.getByTestId("report-close").click();
  await d.getByTestId("album-photo").nth(3).click();
  await d.getByTestId("album-viewer-report").click();
  await expect(d.getByTestId("report-done")).toHaveCount(0);
  await d.locator("[data-testid^=report-reason-]").first().click();
  await d.getByTestId("report-send").click();
  await expect.poll(() => targets.length).toBe(2);
  expect(targets).toEqual([first, second]);
  await damien.ctx.close();
});

// --- Tour 4 (simplification : un retrait est une opération serveur synchrone, qui demande du réseau) -----------------------------------

const CANCEL_ROUTE = "**/api/me/albums/*/photos/by-client/*";
const DELETE_ROUTE = "**/api/me/albums/*/photos/**";

async function oneAddedPhoto(page: Page, name = "car-golf-gti.jpg") {
  await pickPhotos(page, [name]);
  await expect(page.getByTestId("album-tile")).toHaveCount(1, { timeout: 30_000 });
  await page.getByTestId("album-step2-continue").click();
  await expect(page.getByTestId("album-step-label")).toHaveText("Étape 3 sur 3", { timeout: 90_000 });
  await page.getByTestId("album-line-photos").click();
  await expect(page.getByTestId("album-count")).toContainText("1");
}
const openFirstTile = (page: Page, id = "album-tile") => page.getByTestId(id).first().click();

test("retrait en ligne : « Retrait… » pendant l'appel (DELETE retardé), la tuile reste, rien d'autre ne part, elle ne disparaît qu'au 204", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const leo = await openBeziersStep2(browser);
  const page = leo.page;
  try {
    await oneAddedPhoto(page);
    await page.route(CANCEL_ROUTE, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.continue();
    });
    const done = page.waitForResponse(
      (r) => r.url().includes("/photos/by-client/") && r.request().method() === "DELETE",
    );
    await openFirstTile(page);
    await page.getByTestId("album-photo-remove").click();
    await expect(page.getByTestId("album-photo-remove")).toHaveText("Retrait…");
    await expect(page.getByTestId("album-photo-remove")).toBeDisabled();
    await expect(page.getByTestId("album-tile")).toHaveCount(1);
    expect((await done).status()).toBe(204);
    await expect(page.getByTestId("album-tile")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("album-count")).toContainText("0");
    expect((await sql<{ n: number }>(LIVE_PHOTOS))[0]?.n).toBe(0);
  } finally {
    await leo.ctx.close();
    await sql(DROP_BEZIERS_DRAFTS);
  }
});

test("retrait en échec (réseau, 409, 403, réponse perdue) : la tuile reste visible, le message s'affiche, « Réessayer » aboutit une fois l'obstacle levé", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const leo = await openBeziersStep2(browser);
  const page = leo.page;
  try {
    await oneAddedPhoto(page);
    const refuse = (status: number) => async (route: import("@playwright/test").Route) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "refused", message: `Retrait refusé (${status})` } }),
      });
    const cases: Array<[string, (route: import("@playwright/test").Route) => Promise<void>]> = [
      ["réseau", async (route) => route.abort()],
      ["409", refuse(409)],
      ["403", refuse(403)],
      [
        "perdue",
        async (route) => {
          await route.fetch();
          await route.abort();
        },
      ],
    ];
    await openFirstTile(page);
    for (const [name, handler] of cases) {
      await page.unroute(CANCEL_ROUTE);
      await page.route(CANCEL_ROUTE, handler);
      await page.getByTestId("album-photo-remove").click();
      await expect(page.getByTestId("album-remove-error"), name).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("album-photo-remove"), name).toHaveText("Réessayer");
      await expect(page.getByTestId("album-tile"), name).toHaveCount(1);
    }
    // La suppression a bien eu lieu côté serveur (réponse perdue) ; « Réessayer » rejoue : 204 (idempotent), la tuile part.
    await page.unroute(CANCEL_ROUTE);
    await page.getByTestId("album-photo-remove").click();
    await expect(page.getByTestId("album-tile")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("album-count")).toContainText("0");
    expect((await sql<{ n: number }>(LIVE_PHOTOS))[0]?.n).toBe(0);
  } finally {
    await leo.ctx.close();
    await sql(DROP_BEZIERS_DRAFTS);
  }
});

test("hors ligne : « Retirer » est désactivé avec « Il faut du réseau pour retirer une photo. », aucune requête ne part ; le réseau revient, le retrait passe", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const leo = await openBeziersStep2(browser);
  const page = leo.page;
  try {
    await oneAddedPhoto(page);
    const deletes: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "DELETE") deletes.push(r.url());
    });
    await openFirstTile(page);
    await leo.ctx.setOffline(true);
    await expect(page.getByTestId("album-photo-remove")).toBeDisabled({ timeout: 30_000 });
    await expect(page.getByTestId("album-remove-offline")).toContainText("Il faut du réseau pour retirer une photo.");
    await page.getByTestId("album-photo-remove").click({ force: true });
    await page.waitForTimeout(600);
    expect(deletes).toEqual([]);
    await expect(page.getByTestId("album-tile")).toHaveCount(1);
    await leo.ctx.setOffline(false);
    await expect(page.getByTestId("album-photo-remove")).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId("album-photo-remove").click();
    await expect(page.getByTestId("album-tile")).toHaveCount(0, { timeout: 30_000 });
    expect((await sql<{ n: number }>(LIVE_PHOTOS))[0]?.n).toBe(0);
  } finally {
    await leo.ctx.setOffline(false).catch(() => undefined);
    await leo.ctx.close();
    await sql(DROP_BEZIERS_DRAFTS);
  }
});

test("double appui sur « Retirer la photo » : une seule requête de suppression", async ({ browser }) => {
  test.setTimeout(240_000);
  const leo = await openBeziersStep2(browser);
  const page = leo.page;
  try {
    await oneAddedPhoto(page);
    const deletes: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "DELETE") deletes.push(r.url());
    });
    await page.route(CANCEL_ROUTE, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.continue();
    });
    await openFirstTile(page);
    await page.getByTestId("album-photo-remove").dblclick();
    await expect(page.getByTestId("album-tile")).toHaveCount(0, { timeout: 30_000 });
    expect(deletes).toHaveLength(1);
  } finally {
    await leo.ctx.close();
    await sql(DROP_BEZIERS_DRAFTS);
  }
});

test("brouillon repris : la photo du brouillon se retire par le même chemin (échec : elle reste ; « Retrait… » puis disparue au 204)", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const leo = await openBeziersStep2(browser);
  const page = leo.page;
  try {
    await oneAddedPhoto(page);
    await go(page, "/album/nouveau");
    await page.getByTestId("album-event").filter({ hasText: "Béziers Night" }).click();
    await expect(page.getByTestId("album-step1-continue")).toContainText("Reprendre l'album");
    await page.getByTestId("album-step1-continue").click();
    await expect(page.getByTestId("album-tile-base")).toHaveCount(1, { timeout: 30_000 });
    await page.route(DELETE_ROUTE, async (route) =>
      route.request().method() === "DELETE" ? route.abort() : route.continue(),
    );
    await openFirstTile(page, "album-tile-base");
    await page.getByTestId("album-photo-remove").click();
    await expect(page.getByTestId("album-remove-error")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("album-tile-base")).toHaveCount(1);
    await page.unroute(DELETE_ROUTE);
    await page.route(DELETE_ROUTE, async (route) => {
      if (route.request().method() !== "DELETE") return route.continue();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return route.continue();
    });
    await page.getByTestId("album-photo-remove").click();
    await expect(page.getByTestId("album-photo-remove")).toHaveText("Retrait…");
    await expect(page.getByTestId("album-tile-base")).toHaveCount(1);
    await expect(page.getByTestId("album-tile-base")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("album-count")).toContainText("0");
    expect((await sql<{ n: number }>(LIVE_PHOTOS))[0]?.n).toBe(0);
  } finally {
    await leo.ctx.close();
    await sql(DROP_BEZIERS_DRAFTS);
  }
});
