import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser } from "./helpers";
import { sql } from "./helpers/lot48";
import { RELAIS } from "./relais";

// Lot R9f, partie 2 (identification sur une photo d'album et « Tes photos »), côté site (API et site lancés sur la base seedée, à neuf) :
// Léo (média Sud Cars) ouvre une photo de son album, « Identifier une voiture », choisit la voiture de Damien, la ligne apparaît ; Damien
// voit « Voir mes photos » sur l'album, « Tes photos » (« En story » avec le crédit, « Enregistrer », « … » → « Ce n'est pas ma voiture »,
// Léo prévenu), la fiche de la voiture, la sortie passée ; un visiteur sans session ne voit aucune identification ; 1280 et 390 px.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r9f-captures/apres/recette-site`;
test.describe.configure({ mode: "serial" });
const LEO = "leo@orasso.local";
const DAMIEN = "damien@orasso.local";

type Tag = { id: string; kind: string; vehicle: { id: string; label: string } | null; user: { pseudo: string } | null };
type Album = { id: string; photos: { id: string; tags?: Tag[] }[]; event: { id: string } };

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function scenario() {
  const leo = await login(LEO);
  const damien = await login(DAMIEN);
  const tags = await apiCall<{ items: { albumId: string }[] }>(damien, "GET", "/me/album-tags");
  const albumId = tags.data.items[0]?.albumId as string;
  const album = (await apiCall<Album>(leo, "GET", `/albums/${albumId}`)).data;
  const garage = await apiCall<{ id: string }[]>(damien, "GET", "/me/vehicles");
  const vehicleId = garage.data[0]?.id ?? "";
  const label =
    album.photos.flatMap((p) => p.tags ?? []).find((t) => t.vehicle?.id === vehicleId)?.vehicle?.label ?? "";
  return { leo, damien, albumId, album, vehicleId, label };
}

test("un visiteur sans session ne voit aucune identification, ni pseudo ni nombre", async ({ request, browser }) => {
  const s = await scenario();
  const res = await request.get(`/api/albums/${s.albumId}`);
  expect(res.status()).toBe(401);
  expect(await res.text()).not.toMatch(/Damien_66|Kenji_66|tags/);
  for (const path of [`/api/albums/${s.albumId}/taggable`, `/api/me/albums/${s.albumId}/my-photos`]) {
    expect((await request.get(path)).status()).toBe(401);
  }
  // La page de l'album renvoie à la connexion : aucune identification n'est rendue.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`/albums/${s.albumId}`);
  await expect(page.getByTestId("tag-box")).toHaveCount(0);
  await expect(page.getByTestId("identify-banner")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Damien_66");
  await ctx.close();
});

test("Léo identifie la voiture de Damien ; Damien : Tes photos, en story, ce n'est pas ma voiture ; fiche, sortie", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const s = await scenario();
  expect(s.label).not.toBe("");
  const free = s.album.photos.findIndex((p) => !p.tags || p.tags.length === 0);
  expect(free).toBeGreaterThanOrEqual(0);

  const leoCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const leo = await leoCtx.newPage();
  await loginInBrowser(leo, LEO, undefined, `/albums/${s.albumId}`);
  await expect(leo.getByTestId("identify-banner")).toBeVisible({ timeout: 30_000 });
  await expect(leo.getByTestId("identify-banner-count")).toContainText(/\d+ sur \d+ photos identifiées/);
  await shot(leo, "leo-album-bandeau-1280");
  await leo.getByTestId("media-gallery-photo").nth(free).click();
  await expect(leo.getByTestId("tag-who")).toContainText("média auteur de l'album");
  await expect(leo.getByTestId("tag-empty")).toContainText("Choisis la voiture dans le plateau");
  await shot(leo, "leo-visionneuse-vide-1280");
  await leo.getByTestId("tag-open-picker").click();
  await expect(leo.getByTestId("tag-picker-grid")).toBeVisible();
  await shot(leo, "leo-plateau-a-choisir-1280");
  const tile = leo.getByTestId("tag-pick-car").filter({ hasText: s.label }).first();
  await expect(tile.getByTestId("tag-pick-car-name")).toHaveText(s.label);
  await tile.click();
  await expect(leo.getByTestId("tag-done")).toContainText("Voiture identifiée.");
  await expect(leo.getByTestId("tag-line").first()).toContainText(s.label);
  await expect(leo.getByTestId("tag-line-by").first()).toHaveText("identifiée par toi");
  await shot(leo, "leo-visionneuse-apres-pose-1280");
  // La recherche par pseudo : rien sous deux caractères.
  await leo.getByTestId("tag-open-picker").click();
  await leo.getByTestId("tag-picker-search").fill("K");
  await expect(leo.getByText("Personnes", { exact: true })).toHaveCount(0);
  await leo.getByTestId("tag-picker-search").fill("Ke");
  await leo.getByText("Personnes", { exact: true }).click();
  await expect(leo.getByTestId("tag-pick-person").filter({ hasText: "Kenji_66" })).toBeVisible({ timeout: 30_000 });
  await leoCtx.close();

  const damCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const dam = await damCtx.newPage();
  await loginInBrowser(dam, DAMIEN, undefined, "/app/activite");
  const row = dam.getByTestId("activity-album-tagged").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(dam.getByTestId("activity-album-strip").first()).toBeVisible();
  await expect(row).toContainText("Voir mes photos");
  await shot(dam, "damien-activite-1280");
  await row.click();
  await expect(dam.getByTestId("my-photos")).toBeVisible({ timeout: 30_000 });
  await expect(dam.getByTestId("my-photos-headline")).toContainText(`de ta ${s.label}`);
  await expect(dam.getByTestId("my-photos-not-publications")).toContainText("ne deviennent pas tes publications");
  await shot(dam, "damien-tes-photos-1280");

  // « En story » avec le crédit non modifiable (la page est hydratée avant le clic : sans cela, un clic trop tôt n'ouvre rien).
  await dam.waitForLoadState("networkidle");
  await dam.getByTestId("my-photo").first().getByTestId("my-photo-story").click();
  await expect(dam.getByTestId("story-credit")).toHaveText("Photos : Sud Cars");
  await dam.getByTestId("story-publish").click();
  await expect(dam.getByTestId("story-done")).toBeVisible({ timeout: 60_000 });
  await shot(dam, "damien-en-story-1280");
  await dam.keyboard.press("Escape");

  // « Enregistrer » : le fichier part (ou inerte avec sa raison).
  if (await dam.getByTestId("my-photo-save-off").count()) {
    await expect(dam.getByTestId("my-photo-save").first()).toBeDisabled();
  } else {
    const download = dam.waitForEvent("download", { timeout: 30_000 });
    await dam.getByTestId("my-photo-save").first().click();
    expect((await download).suggestedFilename()).toMatch(/\.webp$/);
  }

  // « … » → « Ce n'est pas ma voiture » : la ligne disparaît, Léo est prévenu.
  const n = await dam.getByTestId("my-photo").count();
  await dam.getByTestId("my-photo-more").first().click();
  await expect(dam.getByTestId("photo-sheet-not-mine")).toContainText(
    "Sud Cars en est prévenu ; l'identification disparaît",
  );
  await shot(dam, "damien-feuille-1280");
  dam.on("dialog", (d) => void d.accept());
  await dam.getByTestId("photo-sheet-not-mine").click();
  await expect(dam.getByTestId("my-photo")).toHaveCount(n - 1, { timeout: 30_000 });
  const declined = await sql<{ n: string }>(
    "select count(*)::text as n from notifications where type = 'album_tag_declined' and user_id = (select id from \"user\" where email = $1)",
    [LEO],
  );
  expect(Number(declined[0]?.n)).toBeGreaterThanOrEqual(1);

  // La fiche de la voiture et la sortie passée.
  await dam.goto(`/app/garage/${s.vehicleId}`);
  await expect(dam.getByTestId("vehicle-album-mentions")).toBeVisible({ timeout: 30_000 });
  await expect(dam.getByTestId("album-mention-title").first()).toContainText("Vu au ");
  await shot(dam, "damien-fiche-voiture-1280");
  await dam.goto("/app/sorties?vue=passes");
  await expect(dam.getByTestId("outing-album-photos").first()).toBeVisible({ timeout: 30_000 });
  await expect(dam.getByTestId("album-mention-title").first()).toHaveText("Photos de ma voiture");
  await shot(dam, "damien-sortie-passee-1280");
  await damCtx.close();
});

test("390 px : « Tes photos » et le plateau tiennent sans défilement horizontal", async ({ browser }) => {
  test.setTimeout(180_000);
  const s = await scenario();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await loginInBrowser(page, DAMIEN, undefined, `/app/albums/${s.albumId}/mes-photos`);
  await expect(page.getByTestId("my-photos")).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await shot(page, "damien-tes-photos-390");
  await page.goto(`/albums/${s.albumId}`);
  await expect(page.getByTestId("album-my-photos-link")).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await shot(page, "damien-album-390");
  await ctx.close();
});
