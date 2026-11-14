import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, unique } from "./helpers";
import { sql } from "./helpers/lot48";

// Lot R9e (albums des médias), côté site (API et site lancés sur la base seedée) : Léo (Sud Cars) crée un album en trois étapes (un
// événement où il est accrédité, trois photos dont une avec un cadre de plaque « Flouter et ajouter », titre, « Enregistrer » autorisé),
// le publie, le retrouve dans « Contenus » et sur sa fiche (« Albums »), Damien le voit dans son Fil (carte, « Voir l'album », sans flamme
// ni commentaire) et sur la fiche, sans bouton de gestion ; le brouillon du seed se reprend ; l'accréditation en attente est grisée ; la
// galerie reprise de Béziers Night (4 photos) s'ouvre comme un album ; sans session, la fiche de l'événement montre l'album et rien
// n'identifie personne. Photos : celles du seed seulement.
test.use({ viewport: { width: 1280, height: 900 } });
const PHOTOS = resolve(import.meta.dirname, "../../api/scripts/seed/assets/photos");
const photo = (name: string) => ({ name, mimeType: "image/jpeg", buffer: readFileSync(`${PHOTOS}/${name}`) });
const LEO = "leo@orasso.local";
const DAMIEN = "damien@orasso.local";

type Summary = {
  id: string;
  title: string;
  status: string;
  photosCount: number;
  allowSave: boolean;
  media: { key: string };
};

async function leoAlbums(status: "published" | "draft") {
  const cookie = await login(LEO);
  const list = await apiCall<{ items: Summary[] }>(cookie, "GET", `/me/albums?status=${status}&limit=100`);
  return { cookie, items: list.data.items };
}

async function chooseEvent(page: Page, title: string) {
  await page.locator("label.alb-option", { hasText: title }).locator("input").check();
}

test("Léo crée un album en trois étapes, le publie ; Damien le voit dans son Fil et sur la fiche", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const title = `Béziers Night R9e ${unique()}`;
  let albumId: string | null = null;
  try {
    await loginInBrowser(page, LEO, undefined, "/app/media?onglet=contenus");
    await page.getByTestId("media-new-album").click();
    await page.waitForURL(/\/app\/media\/albums\/nouveau/);
    await page.waitForLoadState("networkidle");

    // Étape 1 : seulement les événements où le média est accrédité ; l'accréditation en attente est grisée.
    await expect(page.getByTestId("album-step-label")).toHaveText("Étape 1 sur 3");
    await expect(page.getByTestId("album-event")).toHaveCount(3);
    await expect(page.getByTestId("album-event-pending")).toHaveCount(1);
    await expect(page.getByTestId("album-event-pending")).toBeDisabled();
    await expect(page.locator("label.alb-option", { hasText: "C&C Perpignan" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(page.locator("label.alb-option", { hasText: "Expo Rivesaltes" })).toHaveCount(0);
    await chooseEvent(page, "Béziers Night");
    await expect(page.getByTestId("album-step1-continue")).toHaveText("Continuer");
    await page.getByTestId("album-step1-continue").click();

    // Étape 2 : trois photos, un cadre de plaque sur la première, une décision pour le lot.
    await expect(page.getByTestId("album-step-label")).toHaveText("Étape 2 sur 3");
    await page
      .getByTestId("album-pick")
      .setInputFiles([photo("car-golf-gti.jpg"), photo("car-mx5.jpg"), photo("car-supra.jpg")]);
    await expect(page.getByTestId("album-tile")).toHaveCount(3);
    await expect(page.getByTestId("album-count")).toContainText("3");
    await expect(page.getByTestId("album-plates")).toHaveCount(0);
    await page.getByTestId("album-mark").first().click();
    await expect(page.getByTestId("album-plate-editor")).toBeVisible();
    await expect(page.getByTestId("album-plates")).toContainText("1 photo avec une plaque repérée");
    // Tant que le lot n'a pas de décision, on ne continue pas (le floutage est proposé, jamais imposé).
    await expect(page.getByTestId("album-step2-continue")).toBeDisabled();
    await expect(page.getByTestId("album-needs-decision")).toBeVisible();
    await page.getByTestId("album-blur").click();
    await expect(page.getByTestId("album-plates")).toContainText("1 photo floutée");
    await page.getByTestId("album-change").click();
    await expect(page.getByTestId("album-blur")).toBeVisible();
    await page.getByTestId("album-blur").click();
    await expect(page.getByTestId("album-step2-continue")).toBeEnabled();
    await page.getByTestId("album-step2-continue").click();

    // Étape 3 : titre, « Enregistrer » autorisé, ce que verront les autres, « Publier l'album ».
    await expect(page.getByTestId("album-step-label")).toHaveText("Étape 3 sur 3", { timeout: 90_000 });
    await expect(page.getByTestId("album-title")).toHaveAttribute("placeholder", "Les photos du Béziers Night");
    await page.getByTestId("album-title").fill(title);
    await expect(page.getByTestId("album-line-credit")).toContainText("Photos : Sud Cars");
    await expect(page.getByTestId("album-line-event")).toContainText("Béziers Night");
    await expect(page.getByTestId("album-line-photos")).toContainText("3 photos");
    await page.getByTestId("album-allow-save").check();
    await expect(page.getByTestId("album-preview")).toContainText(title);
    await expect(page.getByTestId("album-preview")).toContainText("3 photos");
    await page.getByTestId("album-publish").click();

    // L'album ouvert : couverture, titre, tags, événement, emplacement de R9f vide, photos, gestion du média.
    await page.waitForURL(/\/albums\/[0-9a-f-]{36}/, { timeout: 60_000 });
    albumId = page.url().match(/\/albums\/([0-9a-f-]{36})/)?.[1] ?? null;
    await expect(page.getByTestId("album-open-title")).toHaveText(title);
    await expect(page.getByTestId("album-tag-count")).toHaveText("3 photos");
    await expect(page.getByTestId("album-tag-credit")).toHaveText("Photos : Sud Cars");
    await expect(page.getByTestId("album-tag-official")).toHaveCount(0);
    await expect(page.getByTestId("album-event-link")).toContainText("présent au Béziers Night");
    // R9f partie 2 remplit l'emplacement laissé par R9e : pour l'auteur de l'album, « Identifier les voitures · 0 sur 3 photos identifiées ».
    await expect(page.getByTestId("album-identify-slot")).toBeAttached();
    await expect(page.getByTestId("identify-banner")).toContainText("Identifier les voitures");
    await expect(page.getByTestId("identify-banner-count")).toHaveText("0 sur 3 photos identifiées");
    await expect(page.getByTestId("media-gallery-photo")).toHaveCount(3);
    await expect(page.getByTestId("album-owner")).toBeVisible();
    await expect(page.getByTestId("album-report")).toHaveCount(0);
    await page.getByTestId("media-gallery-photo").first().click();
    await expect(page.getByTestId("media-gallery-credit")).toHaveText("Photos : Sud Cars");
    // Le titulaire peut retirer la photo affichée depuis la visionneuse (et ne la signale pas).
    await expect(page.getByTestId("album-photo-remove")).toBeVisible();
    await expect(page.getByTestId("media-gallery-viewer").getByTestId("report-open")).toHaveCount(0);
    await page.keyboard.press("Escape");
    // Plaque : une photo floutée, deux sans plaque (l'état vrai côté API, vu du seul titulaire par la base).
    const mine = await leoAlbums("published");
    const created = mine.items.find((a) => a.id === albumId);
    expect(created).toMatchObject({ title, photosCount: 3, allowSave: true });

    // « Contenus » du média : l'album y est (lien) ; la fiche du média : « Albums » et ses compteurs.
    await page.goto("/app/media?onglet=contenus");
    await expect(page.getByTestId("media-content-album").filter({ hasText: title })).toBeVisible();
    const mediaId = created?.media.key.slice(2);
    await page.goto(`/m/${mediaId}?onglet=albums`);
    await expect(page.getByTestId("media-public-albums")).toBeVisible();
    await expect(page.getByTestId("media-public-album").filter({ hasText: title })).toBeVisible();
    await expect(page.getByTestId("media-public-albums-count")).toHaveText(/^\d+ albums? · \d+ photos?$/);

    // Damien : la carte « album » dans son Fil (« Voir l'album », ni flamme ni commentaire), puis la fiche sans gestion.
    const damien = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const dpage = await damien.newPage();
    // Les cartes déjà montrées à Damien par une passe précédente ne reviennent pas (« Déjà vu ») : son Fil repart de neuf (lui seul : les autres comptes ne sont pas touchés).
    await sql(`delete from feed_seen where user_id = (select id from "user" where email = 'damien@orasso.local')`);
    await sql(
      `delete from feed_seen_floor where user_id = (select id from "user" where email = 'damien@orasso.local')`,
    );
    await loginInBrowser(dpage, DAMIEN, undefined, "/app/fil");
    await expect(dpage.getByTestId("fil-list")).toBeVisible({ timeout: 30_000 });
    const card = dpage.getByTestId("feed-card-album").filter({ hasText: title });
    for (let i = 0; i < 12 && !(await card.isVisible().catch(() => false)); i++) {
      await dpage.mouse.wheel(0, 1200);
      const more = dpage.getByTestId("fil-more");
      if (await more.isVisible().catch(() => false)) await more.click();
      await dpage.waitForTimeout(500);
    }
    await expect(card).toBeVisible();
    await expect(card).toContainText("Sud Cars");
    await expect(card).toContainText("Média");
    await expect(card).toContainText("présent au");
    await expect(card).toContainText("3 photos");
    await expect(card.getByTestId("feed-album-open")).toHaveText(/Voir l'album/);
    await expect(card.getByText(/Commenter|flamme/i)).toHaveCount(0);
    await card.getByTestId("feed-album-open").click();
    await dpage.waitForURL(/\/albums\//);
    await expect(dpage.getByTestId("album-open-title")).toHaveText(title);
    await expect(dpage.getByTestId("album-owner")).toHaveCount(0);
    // « Signaler » vit dans la visionneuse (sur la photo affichée) ; Damien n'a pas « Retirer ».
    await dpage.getByTestId("media-gallery-photo").first().click();
    await expect(dpage.getByTestId("media-gallery-viewer").getByTestId("report-open")).toBeVisible();
    await expect(dpage.getByTestId("album-photo-remove")).toHaveCount(0);
    await damien.close();

    // Le titulaire retire une photo depuis la visionneuse : l'album garde les deux autres, le compte suit.
    await page.goto(`/albums/${albumId}`);
    await page.getByTestId("media-gallery-photo").first().click();
    page.once("dialog", (d) => void d.accept());
    await page.getByTestId("album-photo-remove").click();
    await expect(page.getByTestId("media-gallery-photo")).toHaveCount(2);
    await expect(page.getByTestId("album-tag-count")).toHaveText("2 photos");
  } finally {
    if (albumId) {
      const cookie = await login(LEO);
      await apiCall(cookie, "DELETE", `/me/albums/${albumId}`);
    }
  }
});

test("le brouillon du seed se reprend ; la galerie reprise de Béziers Night s'ouvre comme un album de 4 photos", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await loginInBrowser(page, LEO, undefined, "/app/media/albums/nouveau");
  await expect(page.getByTestId("album-step-label")).toHaveText("Étape 1 sur 3");
  await chooseEvent(page, "Nocturne de Canet");
  await expect(page.getByTestId("album-step1-continue")).toHaveText("Reprendre l'album");
  await page.getByTestId("album-step1-continue").click();
  await expect(page.getByTestId("album-step-label")).toHaveText("Étape 2 sur 3");
  await expect(page.getByTestId("album-count")).toContainText("3");
  // Reprise par l'adresse du brouillon.
  const drafts = await leoAlbums("draft");
  const draft = drafts.items.find((a) => a.photosCount === 3);
  expect(draft).toBeTruthy();
  await page.goto(`/app/media/albums/nouveau?album=${draft?.id}`);
  await expect(page.getByTestId("album-step-label")).toHaveText("Étape 2 sur 3");
  await expect(page.getByTestId("album-count")).toContainText("3");

  // La galerie reprise : un album de 4 photos, enregistrement non autorisé.
  const published = await leoAlbums("published");
  const beziers = published.items.find((a) => a.title === "Béziers Night en images");
  expect(beziers).toMatchObject({ photosCount: 4, allowSave: false });
  await page.goto(`/albums/${beziers?.id}`);
  await expect(page.getByTestId("album-open-title")).toHaveText("Béziers Night en images");
  await expect(page.getByTestId("media-gallery-photo")).toHaveCount(4);
  await expect(page.getByTestId("album-tag-count")).toHaveText("4 photos");
});

test("sans session : la fiche de l'événement montre l'album, sans rien d'identifié ; l'album ouvert demande la connexion", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const published = await leoAlbums("published");
  const rassemblement = published.items.find((a) => a.title === "Les photos du Rassemblement Côte Vermeille");
  expect(rassemblement).toBeTruthy();
  await page.goto("/e/rassemblement-cote-vermeille-2025");
  const section = page.getByTestId("media-contents");
  await expect(section).toBeVisible({ timeout: 30_000 });
  await expect(section).toContainText("Les photos du Rassemblement Côte Vermeille");
  const photos = section.getByTestId("media-gallery-photo");
  await expect(photos.first()).toBeVisible();
  // Les photos sont lisibles sans session (route publique), aucune identification de véhicule ni de pseudo.
  const src = await photos.first().locator("img").getAttribute("src");
  expect(src).toContain("/api/public/albums/");
  const res = await page.request.get(src ?? "");
  expect(res.status()).toBe(200);
  await expect(section).not.toContainText("Identifier");
  // L'album ouvert est réservé aux membres : sans session, la connexion.
  await page.goto(`/albums/${rassemblement?.id}`);
  await page.waitForURL(/\/connexion/);
});

// --- Tour 1 (corrections des relectures Opus et Codex) -----------------------------------------------------------------------------

const DROP_BEZIERS_DRAFTS =
  "delete from event_albums where status = 'draft' and event_id = (select id from events where slug = 'beziers-night-2026')";

async function openBeziersStep2(page: Page) {
  await sql(DROP_BEZIERS_DRAFTS);
  await loginInBrowser(page, LEO, undefined, "/app/media/albums/nouveau");
  await chooseEvent(page, "Béziers Night");
  await page.getByTestId("album-step1-continue").click();
  await expect(page.getByTestId("album-step-label")).toHaveText("Étape 2 sur 3");
}

test("la décision de plaque est par photo : une photo à plaque ajoutée après coup rouvre le bloc pour elle, les premières gardent la leur", async ({
  page,
}) => {
  test.setTimeout(120_000);
  try {
    await openBeziersStep2(page);
    await page.getByTestId("album-pick").setInputFiles([photo("car-golf-gti.jpg"), photo("car-mx5.jpg")]);
    await expect(page.getByTestId("album-tile")).toHaveCount(2);
    await page.getByTestId("album-mark").nth(0).click();
    await page.getByTestId("album-mark").nth(1).click();
    await expect(page.getByTestId("album-plates")).toContainText("2 photos avec une plaque repérée");
    await page.getByTestId("album-keep").click();
    await expect(page.getByTestId("album-plates")).toContainText("2 photos gardées telles quelles");
    // Une troisième photo à plaque : le bloc se rouvre pour elle seule, « Continuer » attend sa décision.
    await page.getByTestId("album-pick").setInputFiles([photo("car-supra.jpg")]);
    await expect(page.getByTestId("album-tile")).toHaveCount(3);
    await page.getByTestId("album-mark").nth(2).click();
    await expect(page.getByTestId("album-plates")).toContainText("1 photo avec une plaque repérée");
    await expect(page.getByTestId("album-plates")).toContainText("2 photos gardées telles quelles");
    await expect(page.getByTestId("album-step2-continue")).toBeDisabled();
    await page.getByTestId("album-blur").click();
    // L'album mêle deux décisions : le bloc le dit, rien n'est écrasé.
    await expect(page.getByTestId("album-plates")).toContainText("1 photo floutée");
    await expect(page.getByTestId("album-plates")).toContainText("2 photos gardées telles quelles");
    await expect(page.getByTestId("album-step2-continue")).toBeEnabled();
  } finally {
    await sql(DROP_BEZIERS_DRAFTS);
  }
});

test("réponse perdue après « telle quelle » : « Changer » ne rouvre rien, la reprise rejoue la même décision, la photo reste « telle quelle »", async ({
  page,
}) => {
  test.setTimeout(120_000);
  try {
    await openBeziersStep2(page);
    // Le serveur a validé l'ajout, la réponse se perd (la page ne la reçoit pas).
    let lost = 0;
    await page.route("**/api/me/albums/*/photos", async (route) => {
      if (route.request().method() === "POST" && lost++ === 0) {
        await route.fetch();
        await route.abort();
      } else await route.continue();
    });
    await page.getByTestId("album-pick").setInputFiles([photo("car-golf-gti.jpg")]);
    await page.getByTestId("album-mark").click();
    await page.getByTestId("album-keep").click();
    await page.getByTestId("album-step2-continue").click();
    await expect(page.getByTestId("album-send-error")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("album-step2-continue")).toHaveText("Reprendre l'envoi");
    // L'ajout est parti : la décision est figée, « Changer » a disparu, la photo dit pourquoi.
    await expect(page.getByTestId("album-change")).toHaveCount(0);
    await expect(page.getByTestId("album-decision-frozen")).toBeVisible();
    await expect(page.getByTestId("album-mark")).toHaveCount(0);
    // La reprise rejoue le même clientId avec la même décision : une seule photo, « telle quelle ».
    await page.getByTestId("album-step2-continue").click();
    await expect(page.getByTestId("album-step-label")).toHaveText("Étape 3 sur 3", { timeout: 60_000 });
    const rows = await sql<{ plate_state: string }>(
      "select p.plate_state from event_album_photos p join event_albums a on a.id = p.album_id join events e on e.id = a.event_id where e.slug = 'beziers-night-2026' and a.status = 'draft' and p.deleted_at is null",
    );
    expect(rows.map((r) => r.plate_state)).toEqual(["kept"]);
    // L'étape 3 compte 0 plaque floutée : jamais « floutée » devant une photo qui part lisible.
    await expect(page.getByTestId("album-line-photos")).toContainText("1 photo");
    await expect(page.getByTestId("album-line-photos")).toContainText("0 plaque floutée");
  } finally {
    await sql(DROP_BEZIERS_DRAFTS);
  }
});

test("le titre et l'option de l'étape 3 survivent à un aller-retour vers les photos ; un brouillon repris compte ses plaques floutées et ses photos une fois", async ({
  page,
}) => {
  test.setTimeout(120_000);
  try {
    await openBeziersStep2(page);
    await page.getByTestId("album-pick").setInputFiles([photo("car-golf-gti.jpg")]);
    await page.getByTestId("album-mark").click();
    await page.getByTestId("album-blur").click();
    await page.getByTestId("album-step2-continue").click();
    await expect(page.getByTestId("album-step-label")).toHaveText("Étape 3 sur 3", { timeout: 60_000 });
    await page.getByTestId("album-title").fill("Mon titre choisi");
    await page.getByTestId("album-allow-save").check();
    await page.getByTestId("album-line-photos").click();
    await expect(page.getByTestId("album-step-label")).toHaveText("Étape 2 sur 3");
    await page.getByTestId("album-step2-continue").click();
    await expect(page.getByTestId("album-step-label")).toHaveText("Étape 3 sur 3");
    await expect(page.getByTestId("album-title")).toHaveValue("Mon titre choisi");
    await expect(page.getByTestId("album-allow-save")).toBeChecked();
    await expect(page.getByTestId("album-line-photos")).toContainText("1 plaque floutée");
    // Le brouillon repris (autre séance) : la photo d'avant compte une fois (« 1 photo prête »), ses plaques floutées aussi.
    await page.goto("/app/media/albums/nouveau");
    await chooseEvent(page, "Béziers Night");
    await expect(page.getByTestId("album-step1-continue")).toHaveText("Reprendre l'album");
    await page.getByTestId("album-step1-continue").click();
    await expect(page.getByTestId("album-count")).toContainText("1");
    await expect(page.getByTestId("album-tile-base")).toHaveCount(1);
    await page.getByTestId("album-step2-continue").click();
    await expect(page.getByTestId("album-step-label")).toHaveText("Étape 3 sur 3", { timeout: 60_000 });
    await expect(page.getByTestId("album-line-photos")).toContainText("1 plaque floutée");
    // Retirer une photo déjà ajoutée (d'avant cette séance) : « Retirer » de l'étape des photos.
    await page.getByTestId("album-line-photos").click();
    await page.getByTestId("album-remove-base").click();
    await expect(page.getByTestId("album-tile-base")).toHaveCount(0);
    await expect(page.getByTestId("album-count")).toContainText("0");
  } finally {
    await sql(DROP_BEZIERS_DRAFTS);
  }
});

test("« Signaler » vise la photo affichée dans la visionneuse ; la consultation est comptée à l'ouverture, une fois", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const published = await leoAlbums("published");
  const rassemblement = published.items.find((a) => a.title === "Les photos du Rassemblement Côte Vermeille");
  expect(rassemblement).toBeTruthy();
  const view = await apiCall<{ photos: { id: string }[] }>(await login(DAMIEN), "GET", `/albums/${rassemblement?.id}`);
  const third = view.data.photos[2]?.id;
  expect(third).toBeTruthy();
  const views: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/api\/media-contents\/[^/]+\/view$/.test(r.url())) views.push(r.url());
  });
  let target: { targetType?: string; targetId?: string } | null = null;
  await page.route("**/api/reports", async (route) => {
    target = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ id: crypto.randomUUID() }),
    });
  });
  await loginInBrowser(page, DAMIEN, undefined, `/albums/${rassemblement?.id}`);
  await expect(page.getByTestId("media-gallery-photo")).toHaveCount(12);
  // Damien (membre) ouvre la troisième photo : la consultation est comptée, une fois ; il signale celle-là, jamais la première.
  await page.getByTestId("media-gallery-photo").nth(2).click();
  await expect.poll(() => views.length).toBe(1);
  const dialog = page.getByTestId("media-gallery-viewer");
  await dialog.getByTestId("report-open").click();
  await page.getByTestId("report-dialog").locator("input[type=radio]").first().check();
  await page.getByTestId("report-send").click();
  await expect.poll(() => target?.targetId).toBe(third);
  expect(target).toMatchObject({ targetType: "album_photo", targetId: third });
  // Un membre n'a pas « Retirer » ; il n'y a plus de « Signaler » en pied de page (le seul est dans la visionneuse).
  await expect(dialog.getByTestId("album-photo-remove")).toHaveCount(0);
  await expect(page.getByTestId("album-report")).toHaveCount(0);
  expect(views).toHaveLength(1);
});

// --- Tour 2 (opérations idempotentes par clientId, succès prouvé) ------------------------------------------------------------------

const SITE_ORIGIN = `http://localhost:${process.env.WEB_PORT ?? 5173}`;

/** Publie par l'API un album de `n` photos du seed (sans plaque) sur Béziers Night ; rend son identifiant. */
async function publishByApi(n: number, title: string): Promise<string> {
  const cookie = await login(LEO);
  const api = `http://localhost:${process.env.API_PORT ?? 3001}`;
  const event = await apiCall<{ id: string }>(null, "GET", "/events/by-slug/beziers-night-2026");
  const draft = await apiCall<{ id: string }>(cookie, "POST", "/me/albums", { eventId: event.data.id, title: null });
  for (const name of ["car-golf-gti.jpg", "car-mx5.jpg", "car-supra.jpg"].slice(0, n)) {
    const form = new FormData();
    const f = photo(name);
    form.append("purpose", "album_photo");
    form.append("file", new Blob([new Uint8Array(f.buffer)], { type: f.mimeType }), f.name);
    const up = await fetch(`${api}/api/me/uploads`, {
      method: "POST",
      headers: { origin: SITE_ORIGIN, cookie },
      body: form,
    });
    expect(up.status).toBe(201);
    const key = ((await up.json()) as { key: string }).key;
    const add = await apiCall(cookie, "POST", `/me/albums/${draft.data.id}/photos`, {
      uploadKey: key,
      plateDecision: "none",
      clientId: crypto.randomUUID(),
    });
    expect(add.status).toBe(201);
  }
  await apiCall(cookie, "PATCH", `/me/albums/${draft.data.id}`, { title });
  expect((await apiCall(cookie, "POST", `/me/albums/${draft.data.id}/publish`)).status).toBe(200);
  return draft.data.id;
}

const LIVE_PHOTOS =
  "select count(*)::int n from event_album_photos p join event_albums a on a.id = p.album_id join events e on e.id = a.event_id where e.slug = 'beziers-night-2026' and a.status = 'draft' and p.deleted_at is null";

test("retirer AVANT la validation tardive de l'ajout : l'annulation par clientId est gardée côté API, l'ajout qui arrive ensuite est refusé, aucune photo ne reste", async ({
  page,
}) => {
  test.setTimeout(120_000);
  try {
    await openBeziersStep2(page);
    // L'ajout ne reçoit jamais de réponse (la page abandonne) ; le serveur, lui, le validerait plus tard.
    let held: { url: string; body: string } | null = null;
    await page.route("**/api/me/albums/*/photos", async (route) => {
      if (route.request().method() === "POST" && held === null) {
        held = { url: route.request().url(), body: route.request().postData() ?? "" };
        await route.abort();
      } else await route.continue();
    });
    await page.getByTestId("album-pick").setInputFiles([photo("car-golf-gti.jpg")]);
    await page.getByTestId("album-step2-continue").click();
    await expect(page.getByTestId("album-send-error")).toBeVisible({ timeout: 30_000 });
    // « Retirer » : rien n'est encore dans l'album, la tuile part, l'annulation est confirmée par l'API (204).
    const cancelled = page.waitForResponse(
      (r) => r.url().includes("/photos/by-client/") && r.request().method() === "DELETE",
    );
    // L'envoi resté sans ajout n'est plus utile : il est supprimé aussi (au mieux, un essai), le quota des envois en attente n'est pas encombré.
    const upload = page.waitForResponse(
      (r) => /\/api\/me\/uploads\/[^/]+$/.test(r.url()) && r.request().method() === "DELETE",
    );
    await page.getByTestId("album-remove").click();
    expect((await cancelled).status()).toBe(204);
    expect((await upload).status()).toBe(204);
    await expect(page.getByTestId("album-tile")).toHaveCount(0);
    // La validation tardive arrive : refusée (409), l'album reste vide.
    const sent = held as { url: string; body: string } | null;
    expect(sent).not.toBeNull();
    const late = await page.evaluate(
      async ({ url, body }) =>
        (
          await fetch(url, {
            method: "POST",
            body,
            headers: { "content-type": "application/json" },
            credentials: "same-origin",
          })
        ).status,
      sent as { url: string; body: string },
    );
    expect(late).toBe(409);
    expect((await sql<{ n: number }>(LIVE_PHOTOS))[0]?.n).toBe(0);
  } finally {
    await sql(DROP_BEZIERS_DRAFTS);
  }
});

test("cadres et décision figés pendant l'envoi : retirer le cadre est impossible ; réponse perdue puis reprise : même décision, pas de 409", async ({
  page,
}) => {
  test.setTimeout(120_000);
  try {
    await openBeziersStep2(page);
    await page.route("**/api/me/uploads", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.continue();
    });
    let lost = 0;
    await page.route("**/api/me/albums/*/photos", async (route) => {
      if (route.request().method() === "POST" && lost++ === 0) {
        await route.fetch();
        await route.abort();
      } else await route.continue();
    });
    await page.getByTestId("album-pick").setInputFiles([photo("car-golf-gti.jpg")]);
    await page.getByTestId("album-mark").click();
    await expect(page.getByTestId("album-plate-editor")).toBeVisible();
    await page.getByTestId("album-blur").click();
    await page.getByTestId("album-step2-continue").click();
    // Pendant l'envoi retardé : « Retirer le cadre » et « Cadre posé » sont bloqués, « Changer » et le bloc ne bougent plus.
    await expect(page.getByTestId("album-progress")).toBeVisible();
    await expect(page.getByTestId("album-unmark")).toBeDisabled();
    await expect(page.getByTestId("album-mark")).toBeDisabled();
    await expect(page.getByTestId("album-plate-editor")).toBeVisible();
    // La réponse de l'ajout se perd après validation : la photo est figée « floutée », la reprise rejoue la même décision (pas de 409).
    await expect(page.getByTestId("album-send-error")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("album-change")).toHaveCount(0);
    await page.unroute("**/api/me/uploads");
    await page.getByTestId("album-step2-continue").click();
    await expect(page.getByTestId("album-step-label")).toHaveText("Étape 3 sur 3", { timeout: 60_000 });
    const rows = await sql<{ plate_state: string }>(
      "select p.plate_state from event_album_photos p join event_albums a on a.id = p.album_id join events e on e.id = a.event_id where e.slug = 'beziers-night-2026' and a.status = 'draft' and p.deleted_at is null",
    );
    expect(rows.map((r) => r.plate_state)).toEqual(["blurred"]);
  } finally {
    await sql(DROP_BEZIERS_DRAFTS);
  }
});

test("deux signalements successifs sans fermer la visionneuse : le second formulaire est neuf et vise la seconde photo", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const published = await leoAlbums("published");
  const rassemblement = published.items.find((a) => a.title === "Les photos du Rassemblement Côte Vermeille");
  const view = await apiCall<{ photos: { id: string }[] }>(await login(DAMIEN), "GET", `/albums/${rassemblement?.id}`);
  const [first, second] = [view.data.photos[0]?.id, view.data.photos[1]?.id];
  const targets: string[] = [];
  await page.route("**/api/reports", async (route) => {
    targets.push(route.request().postDataJSON().targetId);
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ id: crypto.randomUUID() }),
    });
  });
  await loginInBrowser(page, DAMIEN, undefined, `/albums/${rassemblement?.id}`);
  await page.getByTestId("media-gallery-photo").first().click();
  const dialog = page.getByTestId("media-gallery-viewer");
  await dialog.getByTestId("report-open").click();
  await page.getByTestId("report-dialog").locator("input[type=radio]").first().check();
  await page.getByTestId("report-send").click();
  await expect(page.getByTestId("report-done")).toBeVisible();
  await page.getByTestId("report-dialog").getByRole("button", { name: "Fermer", exact: true }).click();
  // Photo suivante, la visionneuse reste ouverte : le formulaire n'affiche pas le succès précédent et signale cette photo.
  await dialog.getByRole("button", { name: "Photo suivante" }).click();
  await dialog.getByTestId("report-open").click();
  await expect(page.getByTestId("report-done")).toHaveCount(0);
  await page.getByTestId("report-dialog").locator("input[type=radio]").first().check();
  await page.getByTestId("report-send").click();
  await expect.poll(() => targets.length).toBe(2);
  expect(targets).toEqual([first, second]);
});

test("retirer une photo d'un album publié depuis la visionneuse : confirmation (annulable), dernière photo de la suite → la visionneuse passe à la voisine, refus de l'API visible dans la fenêtre", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const many = await publishByApi(3, `Retrait R9e ${unique()}`);
  const solo = await publishByApi(1, `Retrait seul R9e ${unique()}`);
  try {
    await loginInBrowser(page, LEO, undefined, `/albums/${many}`);
    await expect(page.getByTestId("media-gallery-photo")).toHaveCount(3);
    // 1. La confirmation s'annule : rien n'est retiré.
    await page.getByTestId("media-gallery-photo").nth(2).click();
    page.once("dialog", (d) => void d.dismiss());
    await page.getByTestId("album-photo-remove").click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("media-gallery-photo")).toHaveCount(3);
    // 2. Dernière photo de la suite, confirmée : la visionneuse montre la photo voisine (ou se ferme), jamais une fenêtre vide.
    page.once("dialog", (d) => void d.accept());
    await page.getByTestId("album-photo-remove").click();
    await expect(page.getByTestId("media-gallery-photo")).toHaveCount(2);
    await expect(page.getByTestId("media-gallery-position")).toHaveText("2 / 2");
    await expect(page.getByTestId("media-gallery-current")).toBeVisible();
    // 3. Album publié à une photo : le refus de l'API s'affiche dans la fenêtre.
    await page.goto(`/albums/${solo}`);
    await page.getByTestId("media-gallery-photo").first().click();
    page.once("dialog", (d) => void d.accept());
    await page.getByTestId("album-photo-remove").click();
    await expect(page.getByTestId("media-gallery-viewer").getByTestId("album-photo-remove-error")).toBeVisible();
    await expect(page.getByTestId("media-gallery-photo")).toHaveCount(1);
  } finally {
    const cookie = await login(LEO);
    await apiCall(cookie, "DELETE", `/me/albums/${many}`);
    await apiCall(cookie, "DELETE", `/me/albums/${solo}`);
  }
});

// --- Tour 4 (simplification : un retrait est une opération serveur synchrone, qui demande du réseau) -----------------------------------

const CANCEL_ROUTE = "**/api/me/albums/*/photos/by-client/*";
const DELETE_ROUTE = "**/api/me/albums/*/photos/**";

/** Une photo ajoutée à l'album (étape 3), puis retour à l'étape 2 : sa tuile montre la version du serveur et se retire par « Retirer ». */
async function oneAddedPhoto(page: Page, name = "car-golf-gti.jpg") {
  await page.getByTestId("album-pick").setInputFiles([photo(name)]);
  await page.getByTestId("album-step2-continue").click();
  await expect(page.getByTestId("album-step-label")).toHaveText("Étape 3 sur 3", { timeout: 60_000 });
  await page.getByTestId("album-line-photos").click();
  await expect(page.getByTestId("album-count")).toContainText("1");
}

test("retrait en ligne : « Retrait… » pendant l'appel (DELETE retardé), « Continuer » désactivé, la tuile ne disparaît qu'au 204", async ({
  page,
}) => {
  test.setTimeout(120_000);
  try {
    await openBeziersStep2(page);
    await oneAddedPhoto(page);
    await page.route(CANCEL_ROUTE, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.continue();
    });
    const done = page.waitForResponse(
      (r) => r.url().includes("/photos/by-client/") && r.request().method() === "DELETE",
    );
    await page.getByTestId("album-remove").click();
    // Pendant l'attente : la tuile reste, « Retrait… » est affiché, rien d'autre ne part.
    await expect(page.getByTestId("album-tile-removing")).toBeVisible();
    await expect(page.getByTestId("album-tile")).toHaveCount(1);
    await expect(page.getByTestId("album-step2-continue")).toBeDisabled();
    await expect(page.getByTestId("album-remove")).toBeDisabled();
    expect((await done).status()).toBe(204);
    await expect(page.getByTestId("album-tile")).toHaveCount(0);
    await expect(page.getByTestId("album-tile-removing")).toHaveCount(0);
    await expect(page.getByTestId("album-count")).toContainText("0");
    expect((await sql<{ n: number }>(LIVE_PHOTOS))[0]?.n).toBe(0);
  } finally {
    await sql(DROP_BEZIERS_DRAFTS);
  }
});

test("retrait en échec (réseau, 409, 403, réponse perdue) : la tuile reste visible, le message s'affiche, « Réessayer » aboutit une fois l'obstacle levé", async ({
  page,
}) => {
  test.setTimeout(150_000);
  try {
    await openBeziersStep2(page);
    await oneAddedPhoto(page);
    const refuse = (status: number) => async (route: import("@playwright/test").Route) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "refused", message: `Retrait refusé (${status})` } }),
      });
    // Réseau coupé en route, puis 409, puis 403, puis la réponse perdue APRÈS la suppression effective : à chaque fois la photo reste.
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
    for (const [name, handler] of cases) {
      await page.unroute(CANCEL_ROUTE);
      await page.route(CANCEL_ROUTE, handler);
      await page.getByTestId("album-remove").click();
      await expect(page.getByTestId("album-remove-error"), name).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("album-tile"), name).toHaveCount(1);
      await expect(page.getByTestId("album-count"), name).toContainText("1");
      await expect(page.getByTestId("album-remove-retry"), name).toBeVisible();
    }
    // La suppression a bien eu lieu côté serveur (réponse perdue) ; « Réessayer » rejoue : 204 (idempotent), la tuile part.
    await page.unroute(CANCEL_ROUTE);
    await page.getByTestId("album-remove-retry").click();
    await expect(page.getByTestId("album-tile")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("album-remove-error")).toHaveCount(0);
    expect((await sql<{ n: number }>(LIVE_PHOTOS))[0]?.n).toBe(0);
  } finally {
    await sql(DROP_BEZIERS_DRAFTS);
  }
});

test("hors ligne : « Retirer » est désactivé avec « Il faut du réseau pour retirer une photo. » ; aucune requête ne part ; le réseau revient, le retrait passe", async ({
  page,
}) => {
  test.setTimeout(120_000);
  try {
    await openBeziersStep2(page);
    await oneAddedPhoto(page);
    const deletes: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "DELETE") deletes.push(r.url());
    });
    await page.context().setOffline(true);
    await expect(page.getByTestId("album-remove")).toBeDisabled();
    await expect(page.getByTestId("album-remove-offline")).toContainText("Il faut du réseau pour retirer une photo.");
    await page.getByTestId("album-remove").click({ force: true });
    await page.waitForTimeout(500);
    expect(deletes).toEqual([]);
    await expect(page.getByTestId("album-tile")).toHaveCount(1);
    await page.context().setOffline(false);
    await expect(page.getByTestId("album-remove")).toBeEnabled();
    await page.getByTestId("album-remove").click();
    await expect(page.getByTestId("album-tile")).toHaveCount(0, { timeout: 30_000 });
    expect((await sql<{ n: number }>(LIVE_PHOTOS))[0]?.n).toBe(0);
  } finally {
    await page.context().setOffline(false);
    await sql(DROP_BEZIERS_DRAFTS);
  }
});

test("double appui sur « Retirer » : une seule requête de suppression", async ({ page }) => {
  test.setTimeout(120_000);
  try {
    await openBeziersStep2(page);
    await oneAddedPhoto(page);
    const deletes: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "DELETE") deletes.push(r.url());
    });
    await page.route(CANCEL_ROUTE, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.continue();
    });
    await page.getByTestId("album-remove").dblclick();
    await expect(page.getByTestId("album-tile")).toHaveCount(0, { timeout: 30_000 });
    expect(deletes).toHaveLength(1);
  } finally {
    await sql(DROP_BEZIERS_DRAFTS);
  }
});

test("brouillon repris : la photo du brouillon se retire par le même chemin (« Retrait… », puis disparue au 204) ; un échec la laisse en place", async ({
  page,
}) => {
  test.setTimeout(150_000);
  try {
    await openBeziersStep2(page);
    await oneAddedPhoto(page);
    const draftId = (
      await apiCall<{ items: { id: string; event: { slug: string } }[] }>(
        await login(LEO),
        "GET",
        "/me/albums?status=draft&limit=100",
      )
    ).data.items.find((d) => d.event.slug === "beziers-night-2026")?.id;
    expect(draftId).toBeTruthy();
    await page.goto(`/app/media/albums/nouveau?album=${draftId}`);
    await expect(page.getByTestId("album-step-label")).toHaveText("Étape 2 sur 3");
    await expect(page.getByTestId("album-tile-base")).toHaveCount(1);
    // Échec : la tuile reste, message et « Réessayer ».
    await page.route(DELETE_ROUTE, async (route) =>
      route.request().method() === "DELETE" ? route.abort() : route.continue(),
    );
    await page.getByTestId("album-remove-base").click();
    await expect(page.getByTestId("album-remove-error")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("album-tile-base")).toHaveCount(1);
    // Obstacle levé, DELETE retardé : « Retrait… », puis disparue au 204.
    await page.unroute(DELETE_ROUTE);
    await page.route(DELETE_ROUTE, async (route) => {
      if (route.request().method() !== "DELETE") return route.continue();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return route.continue();
    });
    await page.getByTestId("album-remove-retry").click();
    await expect(page.getByTestId("album-tile-removing")).toBeVisible();
    await expect(page.getByTestId("album-tile-base")).toHaveCount(1);
    await expect(page.getByTestId("album-tile-base")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("album-count")).toContainText("0");
    expect((await sql<{ n: number }>(LIVE_PHOTOS))[0]?.n).toBe(0);
  } finally {
    await sql(DROP_BEZIERS_DRAFTS);
  }
});

test("changement de compte (autre onglet) : formulaire mort, plus aucune requête ; une réponse de suppression en vol n'est pas appliquée ; « Continuer » de l'étape 1 ne crée rien", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  });
  const a = await ctx.newPage();
  const a2 = await ctx.newPage();
  const b = await ctx.newPage();
  try {
    await sql(DROP_BEZIERS_DRAFTS);
    // Onglet a : étape 1, choix fait, rien lancé.
    await loginInBrowser(a, LEO, undefined, "/app/media/albums/nouveau");
    await chooseEvent(a, "Béziers Night");
    // Onglet a2 : étape 2 avec une photo ajoutée, puis un retrait retardé en vol.
    await a2.goto("/app/media/albums/nouveau");
    await chooseEvent(a2, "Béziers Night");
    await a2.getByTestId("album-step1-continue").click();
    await expect(a2.getByTestId("album-step-label")).toHaveText("Étape 2 sur 3");
    await oneAddedPhoto(a2);
    const requests: string[] = [];
    for (const p of [a, a2])
      p.on("request", (r) => r.url().includes("/api/") && requests.push(`${r.method()} ${r.url()}`));
    await a2.route(CANCEL_ROUTE, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });
    await a2.getByTestId("album-remove").click();
    await expect(a2.getByTestId("album-tile-removing")).toBeVisible();
    // Un autre compte se connecte dans ce navigateur.
    await ctx.clearCookies();
    await loginInBrowser(b, DAMIEN, undefined, "/app");
    await expect(a.getByTestId("album-session-stale")).toBeVisible({ timeout: 30_000 });
    await expect(a2.getByTestId("album-session-stale")).toBeVisible({ timeout: 30_000 });
    const before = requests.length;
    // Étape 1 : « Continuer » ne crée aucun brouillon.
    await a.getByTestId("album-step1-continue").click({ force: true });
    await a.waitForTimeout(800);
    await expect(a.getByTestId("album-step-label")).toHaveText("Étape 1 sur 3");
    expect(requests.slice(before).filter((r) => r.startsWith("POST") && r.includes("/me/albums"))).toEqual([]);
    // Étape 2 : la réponse de la suppression en vol n'est pas appliquée (la tuile reste, plus aucune requête ne part).
    await a2.waitForTimeout(4000);
    await expect(a2.getByTestId("album-tile")).toHaveCount(1);
    await a2.getByTestId("album-step2-continue").click({ force: true });
    await a2.getByTestId("album-remove").click({ force: true });
    await a2.waitForTimeout(800);
    await expect(a2.getByTestId("album-step-label")).toHaveText("Étape 2 sur 3");
    // Après la mort du formulaire : aucune requête d'album ni d'envoi, quelle que soit la méthode (le DELETE by-client déjà en vol est parti avant).
    const after = requests.slice(before).filter((r) => /\/api\/(me\/albums|me\/uploads|albums)/.test(r));
    expect(after).toEqual([]);
  } finally {
    await ctx.close();
    await sql(DROP_BEZIERS_DRAFTS);
  }
});

// --- Tour 5 (le tour a un propriétaire ; garde de retrait commune ; sortie bloquée ; mort définitive) ----------------------------------

const ALBUM_READ = /\/api\/albums\/[0-9a-f-]{36}$/;

test("« Continuer » tient le tour jusqu'à l'étape 3 : lecture de l'album retardée après l'envoi, « Retirer », « Ajouter » et « Continuer » restent désactivés", async ({
  page,
}) => {
  test.setTimeout(120_000);
  try {
    await openBeziersStep2(page);
    await page.route(ALBUM_READ, async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return route.continue();
    });
    await page.getByTestId("album-pick").setInputFiles([photo("car-golf-gti.jpg")]);
    await page.getByTestId("album-step2-continue").click();
    // L'envoi est fini (la photo est dans l'album), la lecture de l'album est encore en route : toujours sous le tour de « Continuer ».
    await expect.poll(async () => (await sql<{ n: number }>(LIVE_PHOTOS))[0]?.n, { timeout: 30_000 }).toBe(1);
    await expect(page.getByTestId("album-progress")).toHaveCount(0);
    await expect(page.getByTestId("album-step-label")).toHaveText("Étape 2 sur 3");
    await expect(page.getByTestId("album-remove")).toBeDisabled();
    await expect(page.getByTestId("album-pick")).toBeDisabled();
    await expect(page.getByTestId("album-step2-continue")).toBeDisabled();
    // Un retrait forcé ne part pas : aucune suppression, la photo est toujours dans l'album.
    const deletes: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "DELETE") deletes.push(r.url());
    });
    await page.getByTestId("album-remove").click({ force: true });
    await expect(page.getByTestId("album-step-label")).toHaveText("Étape 3 sur 3", { timeout: 30_000 });
    expect(deletes).toEqual([]);
    expect((await sql<{ n: number }>(LIVE_PHOTOS))[0]?.n).toBe(1);
  } finally {
    await sql(DROP_BEZIERS_DRAFTS);
  }
});

test("une photo dont l'envoi est en vol ne se retire pas (« Envoi… ») ; après l'ajout, elle se retire par le serveur", async ({
  page,
}) => {
  test.setTimeout(120_000);
  try {
    await openBeziersStep2(page);
    await page.route("**/api/me/uploads", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });
    const deletes: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "DELETE") deletes.push(r.url());
    });
    await page.getByTestId("album-pick").setInputFiles([photo("car-golf-gti.jpg")]);
    await page.getByTestId("album-step2-continue").click();
    await expect(page.getByTestId("album-progress")).toBeVisible();
    await expect(page.getByTestId("album-tile-sending")).toBeVisible();
    await expect(page.getByTestId("album-remove")).toBeDisabled();
    await page.getByTestId("album-remove").click({ force: true });
    await page.waitForTimeout(500);
    // Aucun retrait local ni serveur pendant l'envoi : la tuile est toujours là, l'envoi aboutit.
    await expect(page.getByTestId("album-tile")).toHaveCount(1);
    expect(deletes).toEqual([]);
    await expect(page.getByTestId("album-step-label")).toHaveText("Étape 3 sur 3", { timeout: 60_000 });
    expect((await sql<{ n: number }>(LIVE_PHOTOS))[0]?.n).toBe(1);
    // Ajoutée : le retrait passe par le serveur (annulation par clientId, 204).
    await page.getByTestId("album-line-photos").click();
    await page.unroute("**/api/me/uploads");
    const cancelled = page.waitForResponse(
      (r) => r.url().includes("/photos/by-client/") && r.request().method() === "DELETE",
    );
    await page.getByTestId("album-remove").click();
    expect((await cancelled).status()).toBe(204);
    await expect(page.getByTestId("album-tile")).toHaveCount(0);
    expect((await sql<{ n: number }>(LIVE_PHOTOS))[0]?.n).toBe(0);
  } finally {
    await sql(DROP_BEZIERS_DRAFTS);
  }
});

test("quitter pendant une opération : le lien « Fermer » est bloqué (message), après le 204 on quitte, et le brouillon repris n'a plus la photo", async ({
  page,
}) => {
  test.setTimeout(150_000);
  try {
    await openBeziersStep2(page);
    await oneAddedPhoto(page);
    const draftId = (
      await apiCall<{ items: { id: string; event: { slug: string } }[] }>(
        await login(LEO),
        "GET",
        "/me/albums?status=draft&limit=100",
      )
    ).data.items.find((d) => d.event.slug === "beziers-night-2026")?.id;
    expect(draftId).toBeTruthy();
    await page.route(CANCEL_ROUTE, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });
    const done = page.waitForResponse(
      (r) => r.url().includes("/photos/by-client/") && r.request().method() === "DELETE",
    );
    await page.getByTestId("album-remove").click();
    await expect(page.getByTestId("album-tile-removing")).toBeVisible();
    // Quitter par le lien « Fermer » : refusé tant que l'opération dure, la page et son message restent.
    await page.getByRole("link", { name: "Fermer" }).first().click();
    await expect(page.getByTestId("album-leave-blocked")).toBeVisible();
    await expect(page).toHaveURL(/\/app\/media\/albums\/nouveau/);
    expect((await done).status()).toBe(204);
    await expect(page.getByTestId("album-tile")).toHaveCount(0);
    await expect(page.getByTestId("album-leave-blocked")).toHaveCount(0);
    // L'opération est finie : on quitte, puis on reprend le brouillon.
    await page.getByRole("link", { name: "Fermer" }).first().click();
    await expect(page).toHaveURL(/\/app\/media/);
    await expect(page).not.toHaveURL(/albums\/nouveau/);
    await page.goto(`/app/media/albums/nouveau?album=${draftId}`);
    await expect(page.getByTestId("album-step-label")).toHaveText("Étape 2 sur 3");
    await expect(page.getByTestId("album-tile-base")).toHaveCount(0);
    expect((await sql<{ n: number }>(LIVE_PHOTOS))[0]?.n).toBe(0);
  } finally {
    await sql(DROP_BEZIERS_DRAFTS);
  }
});

test("la mort du formulaire est définitive : A, puis B, puis A : toujours mort, aucune requête d'album ne part", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  });
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  try {
    await openBeziersStep2(a);
    await oneAddedPhoto(a);
    // Un autre compte se connecte (B), puis le compte d'origine revient (A) : le formulaire de A ne revit pas.
    await ctx.clearCookies();
    await loginInBrowser(b, DAMIEN, undefined, "/app");
    await expect(a.getByTestId("album-session-stale")).toBeVisible({ timeout: 30_000 });
    await ctx.clearCookies();
    await loginInBrowser(b, LEO, undefined, "/app");
    await a.waitForTimeout(1500);
    await expect(a.getByTestId("album-session-stale")).toBeVisible();
    const requests: string[] = [];
    a.on("request", (r) => {
      if (/\/api\/(me\/albums|me\/uploads|albums)/.test(r.url())) requests.push(`${r.method()} ${r.url()}`);
    });
    await expect(a.getByTestId("album-remove")).toBeDisabled();
    await expect(a.getByTestId("album-step2-continue")).toBeDisabled();
    await a.getByTestId("album-remove").click({ force: true });
    await a.getByTestId("album-step2-continue").click({ force: true });
    await a.waitForTimeout(800);
    expect(requests).toEqual([]);
    await expect(a.getByTestId("album-tile")).toHaveCount(1);
  } finally {
    await ctx.close();
    await sql(DROP_BEZIERS_DRAFTS);
  }
});

test("compte changé pendant la publication : le formulaire mort rend son tour, « Fermer » et le rechargement ne sont pas retenus (ni lien bloqué, ni invite de fermeture)", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  });
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  const dialogs: string[] = [];
  a.on("dialog", (d) => {
    dialogs.push(d.type());
    void d.dismiss();
  });
  try {
    await openBeziersStep2(a);
    await a.getByTestId("album-pick").setInputFiles([photo("car-golf-gti.jpg")]);
    await a.getByTestId("album-step2-continue").click();
    await expect(a.getByTestId("album-step-label")).toHaveText("Étape 3 sur 3", { timeout: 60_000 });
    // « Publier » : l'enregistrement du titre est retardé, le compte change pendant ce temps.
    await a.route("**/api/me/albums/*", async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return route.continue();
    });
    await a.getByTestId("album-publish").click();
    await ctx.clearCookies();
    await loginInBrowser(b, DAMIEN, undefined, "/app");
    await expect(a.getByTestId("album-session-stale")).toBeVisible({ timeout: 30_000 });
    // La réponse arrive : rien n'est appliqué, rien n'est publié, et le tour est rendu (plus de blocage de sortie).
    await a.waitForTimeout(4500);
    const prevented = await a.evaluate(() => {
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(prevented).toBe(false);
    await expect(a.getByTestId("album-step-label")).toHaveText("Étape 3 sur 3");
    // « Fermer » n'est pas retenu : la page part.
    await a.getByRole("link", { name: "Fermer" }).first().click();
    await expect(a).not.toHaveURL(/albums\/nouveau/, { timeout: 30_000 });
    expect(dialogs).toEqual([]);
    expect(
      (
        await sql<{ n: number }>(
          "select count(*)::int n from event_albums where status = 'published' and title like 'Les photos du Béziers%'",
        )
      )[0]?.n ?? 0,
    ).toBe(0);
  } finally {
    await ctx.close();
    await sql(DROP_BEZIERS_DRAFTS);
  }
});

test("requête qui ne répond jamais : délai d'abandon, échec affiché avec « Réessayer », la photo reste, le tour est rendu et la sortie est possible", async ({
  page,
}) => {
  test.setTimeout(150_000);
  try {
    await openBeziersStep2(page);
    await oneAddedPhoto(page);
    // L'annulation ne reçoit jamais de réponse.
    await page.route(CANCEL_ROUTE, () => new Promise(() => undefined));
    await page.getByTestId("album-remove").click();
    await expect(page.getByTestId("album-tile-removing")).toBeVisible();
    await expect(page.getByTestId("album-remove-error")).toContainText("Le serveur ne répond pas", { timeout: 45_000 });
    await expect(page.getByTestId("album-tile")).toHaveCount(1);
    await expect(page.getByTestId("album-remove-retry")).toBeVisible();
    await expect(page.getByTestId("album-step2-continue")).toBeEnabled();
    // Le tour est rendu : « Fermer » n'est pas retenu.
    await page.getByRole("link", { name: "Fermer" }).first().click();
    await expect(page).not.toHaveURL(/albums\/nouveau/, { timeout: 30_000 });
  } finally {
    await sql(DROP_BEZIERS_DRAFTS);
  }
});

test("visionneuse : après le retrait de la dernière photo de la suite, « précédente » et « suivante » changent bien de photo", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const album = await publishByApi(3, `Navigation R9e ${unique()}`);
  try {
    await loginInBrowser(page, LEO, undefined, `/albums/${album}`);
    await page.getByTestId("media-gallery-photo").nth(2).click();
    page.once("dialog", (d) => void d.accept());
    await page.getByTestId("album-photo-remove").click();
    await expect(page.getByTestId("media-gallery-photo")).toHaveCount(2);
    await expect(page.getByTestId("media-gallery-position")).toHaveText("2 / 2");
    const src = () => page.getByTestId("media-gallery-current").getAttribute("src");
    const second = await src();
    await page.getByTestId("media-gallery-viewer").getByRole("button", { name: "Photo précédente" }).click();
    await expect(page.getByTestId("media-gallery-position")).toHaveText("1 / 2");
    expect(await src()).not.toBe(second);
    await page.getByTestId("media-gallery-viewer").getByRole("button", { name: "Photo suivante" }).click();
    await expect(page.getByTestId("media-gallery-position")).toHaveText("2 / 2");
    expect(await src()).toBe(second);
  } finally {
    await apiCall(await login(LEO), "DELETE", `/me/albums/${album}`);
  }
});
