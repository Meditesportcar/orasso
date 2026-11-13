import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD } from "./helpers";
import { sql } from "./helpers/lot48";
import { RELAIS } from "./relais";

// Lot R9f, partie 2 (identification sur une photo d'album et « Tes photos »), côté appli (version web compilée de recette, `APP_URL`) :
// Léo (média Sud Cars, auteur de l'album « Côte Vermeille ») ouvre une photo, « Identifier une voiture », choisit la voiture de Damien dans le
// plateau, la ligne apparaît ; Damien reçoit « Sud Cars a publié N photos de ta … » dans l'Activité, « Voir mes photos » ouvre « Tes photos »,
// « En story » publie la story avec le crédit, « Enregistrer » (ou inerte avec sa raison), « … » → « Ce n'est pas ma voiture » : la ligne
// disparaît et Léo est prévenu ; Damien dit « C'est ma voiture » sur une autre photo sans notification ; Kenji par son pseudo (recherche à deux
// caractères) ; la fiche de la voiture, la sortie et le souvenir ; la police ×1,3 tient. Photos du seed seulement, aucune plaque lisible.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r9f-captures/apres/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });
test.describe.configure({ mode: "serial" });

const LEO = "leo@orasso.local";
const DAMIEN = "damien@orasso.local";
const KENJI = "kenji@orasso.local";

type Tag = {
  id: string;
  kind: string;
  vehicle: { id: string; label: string } | null;
  user: { pseudo: string } | null;
  mine: boolean;
};
type Album = {
  id: string;
  media: { name: string };
  event: { id: string; slug: string; title: string };
  photos: { id: string; tags?: Tag[] }[];
};
type Mention = { albumId: string; count: number };

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string, opts: { theme?: string; scale?: number; width?: number } = {}) {
  const { theme = "beton", scale = 1, width = 390 } = opts;
  const ctx = await browser.newContext({ viewport: { width, height: 860 }, baseURL: APP, acceptDownloads: true });
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

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

/** L'album de Sud Cars du seed, vu par Léo (identifications comprises), et la voiture de Damien. */
async function scenario() {
  const leo = await login(LEO);
  const damien = await login(DAMIEN);
  const mineTags = await apiCall<{ items: Mention[] }>(damien, "GET", "/me/album-tags");
  const albumId = mineTags.data.items[0]?.albumId as string;
  const album = await apiCall<Album>(leo, "GET", `/albums/${albumId}`);
  // La voiture de Damien : sa première voiture, celle que le seed fait identifier par Sud Cars.
  const garage = await apiCall<{ id: string }[]>(damien, "GET", "/me/vehicles");
  const vehicleId = garage.data[0]?.id ?? "";
  const car = album.data.photos.flatMap((p) => p.tags ?? []).find((t) => t.vehicle?.id === vehicleId);
  return {
    leo,
    damien,
    albumId,
    album: album.data,
    carLabel: car?.vehicle?.label ?? "",
    vehicleId: car?.vehicle?.id ?? "",
  };
}

async function openPhoto(page: Page, index: number) {
  await expect(page.getByTestId("album-photo").nth(index)).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("album-photo").nth(index).click();
  await expect(page.getByTestId("album-viewer")).toBeVisible();
}

test("Léo identifie la voiture de Damien, Damien reçoit « Tes photos », en story, ce n'est pas ma voiture", async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const s = await scenario();
  expect(s.carLabel).not.toBe("");
  // Une photo sans identification, que Léo va identifier.
  const free = s.album.photos.findIndex((p) => !p.tags || p.tags.length === 0);
  expect(free).toBeGreaterThanOrEqual(0);
  const before = (await apiCall<{ items: Mention[] }>(s.damien, "GET", "/me/album-tags")).data.items[0]?.count ?? 0;

  const leo = await open(browser, LEO);
  await go(leo.page, `/album/${s.albumId}`);
  // Le bandeau « Identifier les voitures · N sur M photos identifiées · Continuer ».
  await expect(leo.page.getByTestId("identify-banner")).toBeVisible({ timeout: 30_000 });
  await expect(leo.page.getByTestId("identify-banner-count")).toContainText(/\d+ sur \d+ photos identifiées/);
  await expect(leo.page.getByTestId("album-photo-car-badge").first()).toBeVisible();
  await shot(leo.page, "leo-album-bandeau-beton");
  await openPhoto(leo.page, free);
  await expect(leo.page.getByTestId("album-action-tag-identify")).toBeVisible();
  await leo.page.getByTestId("album-action-tag-identify").click();
  await expect(leo.page.getByTestId("tag-who")).toContainText("média auteur de l'album");
  await expect(leo.page.getByTestId("tag-empty")).toContainText("Choisis la voiture dans le plateau");
  await expect(leo.page.getByTestId("tag-not-a-face")).toBeVisible();
  await shot(leo.page, "leo-visionneuse-vide-beton");
  await leo.page.getByTestId("tag-open-picker").click();
  await expect(leo.page.getByTestId("tag-picker-grid")).toBeVisible();
  await shot(leo.page, "leo-plateau-a-choisir-beton");
  const tile = leo.page.getByTestId("tag-pick-car").filter({ hasText: s.carLabel }).first();
  // Le nom de la voiture entier, jamais coupé.
  await expect(tile.getByTestId("tag-pick-car-name")).toHaveText(s.carLabel);
  await tile.click();
  await expect(leo.page.getByTestId("tag-done")).toContainText("Voiture identifiée.");
  await expect(leo.page.getByTestId("tag-done")).toContainText(
    "est prévenu : une notification pour l'album, pas une par photo.",
  );
  await expect(leo.page.getByTestId("tag-line").first()).toContainText(s.carLabel);
  await expect(leo.page.getByTestId("tag-line-by").first()).toHaveText("identifiée par toi");
  await expect(leo.page.getByTestId("tag-line-remove").first()).toBeVisible();
  await shot(leo.page, "leo-visionneuse-apres-pose-beton");

  // Damien : la notification (une par album), « Voir mes photos », « Tes photos ».
  const act = await apiCall<{ groups: { items: { type: string; title: string; data: { count?: number } }[] }[] }>(
    s.damien,
    "GET",
    "/me/activity",
  );
  const tagged = act.data.groups.flatMap((g) => g.items).filter((i) => i.type === "album_tagged");
  expect(tagged).toHaveLength(1);
  expect(tagged[0]?.title).toMatch(/^Sud Cars a publié \d+ photos de ta .+ au /);
  const after = (await apiCall<{ items: Mention[] }>(s.damien, "GET", "/me/album-tags")).data.items[0]?.count ?? 0;
  expect(after).toBe(before + 1);

  const dam = await open(browser, DAMIEN);
  await go(dam.page, "/activite");
  const row = dam.page.getByTestId("activity-album-tagged");
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(dam.page.getByTestId("activity-album-strip")).toBeVisible();
  await expect(row).toContainText("Voir mes photos");
  await shot(dam.page, "damien-activite-beton");
  await row.click();
  await expect(dam.page.getByTestId("my-photos")).toBeVisible({ timeout: 30_000 });
  await expect(dam.page.getByTestId("my-photos-headline")).toContainText(`de ta ${s.carLabel}`);
  const rows = dam.page.getByTestId("my-photo");
  await expect(rows).toHaveCount(after);
  // Aucun bouton principal sur cet écran : seulement des gestes secondaires.
  await expect(dam.page.getByTestId("my-photos-not-publications")).toContainText("ne deviennent pas tes publications");
  await shot(dam.page, "damien-tes-photos-beton");

  // « En story » : la photo reprise avec le crédit, non modifiable.
  await rows.first().getByTestId("my-photo-story").click();
  await expect(dam.page.getByTestId("story-credit")).toHaveText("Photos : Sud Cars");
  await shot(dam.page, "damien-en-story-beton");
  await dam.page.getByTestId("story-publish").click();
  await expect(dam.page.getByTestId("story-done")).toBeVisible({ timeout: 60_000 });
  const stories = await sql<{ n: string }>(
    'select count(*)::text as n from stories s join event_album_photos p on p.id = s.source_album_photo_id where s.author_id = (select id from "user" where email = $1)',
    [DAMIEN],
  );
  expect(Number(stories[0]?.n)).toBeGreaterThanOrEqual(1);
  await dam.page.getByTestId("story-see").click();
  await expect(dam.page.getByTestId("story-photo-credit")).toBeVisible({ timeout: 30_000 });
  await shot(dam.page, "damien-story-credit-beton");

  // Le repartage : Kenji est identifié dans la story de Damien et la reprend dans la sienne ; sa copie garde la ligne « Photos : Sud Cars »
  // **et** la pastille « ajoutée par » (appli).
  const [orig] = await sql<{ id: string }>(
    "select id from stories where source_album_photo_id is not null and shared_from_story_id is null order by created_at desc limit 1",
  );
  const kenjiApi = await login(KENJI);
  const kenjiMe = await apiCall<{ user: { id: string } }>(kenjiApi, "GET", "/me");
  await sql("insert into story_tags (story_id, target_kind, target_id) values ($1, 'user', $2)", [
    orig?.id,
    kenjiMe.data.user.id,
  ]);
  expect((await apiCall(kenjiApi, "POST", `/stories/${orig?.id}/share-to-mine`, {})).status).toBeLessThan(300);
  const kenjiCtx = await open(browser, KENJI);
  await go(kenjiCtx.page, `/story/${encodeURIComponent(`u:${kenjiMe.data.user.id}`)}`);
  await expect(kenjiCtx.page.getByTestId("story-shared-by")).toBeVisible({ timeout: 30_000 });
  await expect(kenjiCtx.page.getByTestId("story-photo-credit")).toHaveText("Photos : Sud Cars");
  await shot(kenjiCtx.page, "kenji-copie-credit-beton");
  await kenjiCtx.ctx.close();

  // Déjà en story : « Tes photos » le dit directement (« Déjà en story · Tout le monde »), sans formulaire de public ni de légende.
  await go(dam.page, `/album/${s.albumId}/mes-photos`);
  const first = dam.page.getByTestId("my-photo").first();
  await expect(first.getByTestId("my-photo-story-live")).toContainText("Déjà en story · Tout le monde", {
    timeout: 30_000,
  });
  await expect(first.getByTestId("my-photo-story")).toHaveCount(0);

  // « Enregistrer » : actif quand le média l'autorise (le fichier part), sinon inerte avec sa raison.
  await go(dam.page, `/album/${s.albumId}/mes-photos`);
  await expect(dam.page.getByTestId("my-photo").first()).toBeVisible({ timeout: 30_000 });
  const save = dam.page.getByTestId("my-photo-save").first();
  if (await dam.page.getByTestId("my-photo-save-off").count()) {
    await expect(save).toBeDisabled();
    await expect(dam.page.getByTestId("my-photo-save-off").first()).toContainText(
      "Enregistrement non autorisé par Sud Cars",
    );
  } else {
    const download = dam.page.waitForEvent("download", { timeout: 30_000 });
    await save.click();
    expect((await download).suggestedFilename()).toMatch(/\.webp$/);
  }

  // « … » → « Ce n'est pas ma voiture » : la ligne disparaît, Léo est prévenu.
  const n = await dam.page.getByTestId("my-photo").count();
  await dam.page.getByTestId("my-photo-more").first().click();
  await expect(dam.page.getByTestId("photo-sheet-intro")).toContainText("Cette photo a été identifiée par Sud Cars.");
  await expect(dam.page.getByTestId("photo-sheet-not-mine")).toContainText(
    "Sud Cars en est prévenu ; l'identification disparaît",
  );
  // Plus de « Contacter » : la conversation de page du média est un lot à part (elle ne doit pas révéler le compte derrière la page).
  await expect(dam.page.getByTestId("photo-sheet-contact")).toHaveCount(0);
  await expect(dam.page.getByTestId("my-photos-contact")).toHaveCount(0);
  await shot(dam.page, "damien-feuille-pas-ma-voiture-beton");
  await dam.page.getByTestId("photo-sheet-not-mine").click();
  await expect(dam.page.getByTestId("my-photo")).toHaveCount(n - 1, { timeout: 30_000 });
  const declined = await sql<{ n: string }>(
    "select count(*)::text as n from notifications where type = 'album_tag_declined' and user_id = (select id from \"user\" where email = $1)",
    [LEO],
  );
  expect(Number(declined[0]?.n)).toBeGreaterThanOrEqual(1);
  await leo.ctx.close();
  await dam.ctx.close();
});

test("Kenji « C'est ma voiture » sans notification (Damien est organisateur : il n'a pas ce bouton) ; Kenji par son pseudo (deux caractères)", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const s = await scenario();
  const a = (await apiCall<Album>(s.leo, "GET", `/albums/${s.albumId}`)).data;
  const free = a.photos.findIndex((p) => !p.tags || p.tags.length === 0);
  expect(free).toBeGreaterThanOrEqual(0);
  const notifBefore = await sql<{ n: string }>(
    "select count(*)::text as n from notifications where type = 'album_tagged' and user_id = (select id from \"user\" where email = $1)",
    [KENJI],
  );

  const dam = await open(browser, KENJI);
  await go(dam.page, `/album/${s.albumId}`);
  // Un passionné n'a pas le bandeau « Identifier les voitures » ; il voit « Voir mes photos ».
  await expect(dam.page.getByTestId("album-my-photos-link")).toBeVisible({ timeout: 30_000 });
  await expect(dam.page.getByTestId("identify-banner")).toHaveCount(0);
  await openPhoto(dam.page, free);
  await dam.page.getByTestId("album-action-tag-mine").click();
  await expect(dam.page.getByTestId("tag-who")).toContainText("propriétaire d'une voiture présente");
  await expect(dam.page.getByTestId("tag-empty")).toContainText("Si c'est ta voiture, dis-le");
  await dam.page.getByTestId("tag-open-picker").click();
  await expect(dam.page.getByTestId("tag-picker-own-only")).toContainText(
    "Seules tes voitures pointées présentes à l'événement sont proposées.",
  );
  // Ses voitures seules, marquées « Toi ».
  await expect(dam.page.getByTestId("tag-pick-car")).toHaveCount(0);
  await shot(dam.page, "kenji-plateau-passionne-beton");
  await dam.page.getByTestId("tag-pick-car-me").first().click();
  await expect(dam.page.getByTestId("tag-done")).toContainText("Voiture identifiée.");
  await expect(dam.page.getByTestId("tag-done")).not.toContainText("prévenu");
  await expect(dam.page.getByTestId("tag-line-by").first()).toHaveText("identifiée par toi");
  const notifAfter = await sql<{ n: string }>(
    "select count(*)::text as n from notifications where type = 'album_tagged' and user_id = (select id from \"user\" where email = $1)",
    [KENJI],
  );
  expect(notifAfter[0]?.n).toBe(notifBefore[0]?.n);
  await dam.ctx.close();

  // Kenji par son pseudo : la recherche ne se déclenche qu'à deux caractères.
  const a2 = (await apiCall<Album>(s.leo, "GET", `/albums/${s.albumId}`)).data;
  const free2 = a2.photos.findIndex((p) => !p.tags || p.tags.length === 0);
  expect(free2).toBeGreaterThanOrEqual(0);
  const leo = await open(browser, LEO);
  await go(leo.page, `/album/${s.albumId}`);
  await openPhoto(leo.page, free2);
  await leo.page.getByTestId("album-action-tag-identify").click();
  await leo.page.getByTestId("tag-open-picker").click();
  await expect(leo.page.getByTestId("tag-picker-grid")).toBeVisible();
  await leo.page.getByTestId("tag-picker-search").fill("K");
  await expect(leo.page.getByText("Personnes", { exact: true })).toHaveCount(0);
  await leo.page.getByTestId("tag-picker-search").fill("Ke");
  await leo.page.getByText("Personnes", { exact: true }).click();
  await expect(leo.page.getByTestId("tag-pick-person").filter({ hasText: "Kenji_66" })).toBeVisible({
    timeout: 30_000,
  });
  await shot(leo.page, "leo-recherche-pseudo-beton");
  await leo.page.getByTestId("tag-pick-person").filter({ hasText: "Kenji_66" }).click();
  await expect(leo.page.getByTestId("tag-line").filter({ hasText: "Kenji_66" })).toBeVisible();
  await leo.ctx.close();
});

test("la fiche de la voiture, la sortie passée et le souvenir ; Béton et Sable", async ({ browser }) => {
  test.setTimeout(300_000);
  const s = await scenario();
  for (const theme of ["beton", "sable"]) {
    const dam = await open(browser, DAMIEN, { theme });
    await go(dam.page, `/vehicule/${s.vehicleId}`);
    await expect(dam.page.getByTestId("vehicle-album-mentions")).toBeVisible({ timeout: 30_000 });
    await expect(dam.page.getByTestId("album-mention-title").first()).toContainText("Vu au ");
    await expect(dam.page.getByTestId("album-mention-count").first()).toContainText("photos");
    await shot(dam.page, `damien-fiche-voiture-${theme}`);
    await dam.page.getByTestId("album-mention-open").first().click();
    await expect(dam.page.getByTestId("my-photos")).toBeVisible({ timeout: 30_000 });
    await shot(dam.page, `damien-tes-photos-${theme}`);

    await go(dam.page, "/sorties");
    await dam.page.getByRole("tab", { name: /Passées/ }).click();
    await expect(dam.page.getByTestId("outing-album-photos").first()).toBeVisible({ timeout: 30_000 });
    await expect(dam.page.getByTestId("album-mention-title").first()).toHaveText("Photos de ma voiture");
    await shot(dam.page, `damien-sortie-passee-${theme}`);

    // Le souvenir de l'événement de l'album (le seed y pointe la voiture de Damien il y a un an) : ses photos sont **exigées**.
    const memory = await apiCall<{ albumPhotos?: Mention[] }>(s.damien, "GET", `/me/memories/${s.album.event.id}`);
    expect(memory.status).toBe(200);
    expect(memory.data.albumPhotos?.length ?? 0).toBeGreaterThan(0);
    await go(dam.page, `/souvenir/${s.album.event.id}`);
    await expect(dam.page.getByTestId("memory-album")).toContainText(/photos? de ta .+ · Sud Cars/);
    await expect(dam.page.getByTestId("memory-album-open")).toContainText("Revoir mes photos");
    await shot(dam.page, `damien-souvenir-${theme}`);
    await dam.ctx.close();
  }
});

test("la police ×1,3 : la visionneuse, le plateau et « Tes photos » tiennent sans couper un nom de voiture", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const s = await scenario();
  const leo = await open(browser, LEO, { scale: 1.3, width: 384 });
  await go(leo.page, `/album/${s.albumId}`);
  await noOverflow(leo.page);
  await openPhoto(leo.page, 0);
  await leo.page.getByTestId("album-action-tag-identify").click();
  await noOverflow(leo.page);
  await shot(leo.page, "leo-visionneuse-police-1.3");
  await leo.page.getByTestId("tag-open-picker").click();
  await expect(leo.page.getByTestId("tag-picker-grid")).toBeVisible();
  for (const name of await leo.page.getByTestId("tag-pick-car-name").all()) {
    const fits = await name.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(fits).toBe(true);
  }
  await noOverflow(leo.page);
  await shot(leo.page, "leo-plateau-police-1.3");
  await leo.ctx.close();
  const dam = await open(browser, DAMIEN, { scale: 1.3, width: 384 });
  await go(dam.page, `/album/${s.albumId}/mes-photos`);
  await expect(dam.page.getByTestId("my-photos")).toBeVisible({ timeout: 30_000 });
  await noOverflow(dam.page);
  await shot(dam.page, "damien-tes-photos-police-1.3");
  await dam.ctx.close();
});

test("Kenji retire sa seule identification : la ligne disparaît, il quitte « Tes photos » sans erreur de chargement", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const s = await scenario();
  const kenji = await login(KENJI);
  // Une seule identification à son nom : les autres sont retirées par l'API (le geste de l'intéressé).
  const mine = await apiCall<{ photos: { tagId: string }[] }>(kenji, "GET", `/me/albums/${s.albumId}/my-photos`);
  for (const p of mine.data.photos.slice(1)) await apiCall(kenji, "DELETE", `/me/album-tags/${p.tagId}`, {});
  const one = await apiCall<{ photos: unknown[] }>(kenji, "GET", `/me/albums/${s.albumId}/my-photos`);
  expect(one.data.photos).toHaveLength(1);
  const k = await open(browser, KENJI);
  await go(k.page, `/album/${s.albumId}/mes-photos`);
  await expect(k.page.getByTestId("my-photo")).toHaveCount(1, { timeout: 30_000 });
  await k.page.getByTestId("my-photo-more").click();
  // Selon qui a posé l'identification restante : « Retirer mon identification » (lui) ou « Ce n'est pas ma voiture » (le média).
  await k.page.getByTestId(/^photo-sheet-(withdraw|not-mine)$/).click();
  // On quitte l'écran : plus de « Tes photos », jamais une erreur de chargement.
  await expect(k.page.getByTestId("my-photos")).toHaveCount(0, { timeout: 30_000 });
  await expect(k.page.getByTestId("load-error")).toHaveCount(0);
  expect(new URL(k.page.url()).pathname).not.toMatch(/\/mes-photos$/);
  const after = await apiCall(kenji, "GET", `/me/albums/${s.albumId}/my-photos`);
  expect(after.status).toBe(404);
  // Rouverte directement : l'écran dit qu'il n'y a plus rien, sans bouton « Réessayer ».
  await go(k.page, `/album/${s.albumId}/mes-photos`);
  await expect(k.page.getByText("Aucune photo n'est identifiée à ton nom dans cet album.")).toBeVisible({
    timeout: 30_000,
  });
  await k.ctx.close();
});
