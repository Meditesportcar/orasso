import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, unique } from "./helpers";

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
    await expect(page.getByTestId("album-identify-slot")).toBeEmpty();
    await expect(page.getByTestId("media-gallery-photo")).toHaveCount(3);
    await expect(page.getByTestId("album-owner")).toBeVisible();
    await expect(page.getByTestId("album-report")).toHaveCount(0);
    await page.getByTestId("media-gallery-photo").first().click();
    await expect(page.getByTestId("media-gallery-credit")).toHaveText("Photos : Sud Cars");
    await page.keyboard.press("Escape");
    // Plaque : une photo floutée, deux sans plaque (l'état vrai côté API, vu du seul titulaire par la base).
    const mine = await leoAlbums("published");
    const created = mine.items.find((a) => a.id === albumId);
    expect(created).toMatchObject({ title, photosCount: 3, allowSave: true });

    // « Contenus » du média : l'album y est (lien) ; la fiche du média : « Albums » et ses compteurs.
    await page.goto("/app/media?onglet=contenus");
    await expect(page.getByTestId("media-content-album").filter({ hasText: title })).toBeVisible();
    const mediaId = created?.media.key.slice(2);
    await page.goto(`/m/${mediaId}`);
    await expect(page.getByTestId("media-public-albums")).toBeVisible();
    await expect(page.getByTestId("media-public-album").filter({ hasText: title })).toBeVisible();
    await expect(page.getByTestId("media-public-albums-count")).toContainText("albums · ");

    // Damien : la carte « album » dans son Fil (« Voir l'album », ni flamme ni commentaire), puis la fiche sans gestion.
    const damien = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const dpage = await damien.newPage();
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
    await expect(dpage.getByTestId("album-report")).toBeVisible();
    await damien.close();
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
