import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import {
  apiCall,
  type Cookie,
  chooseSitePhoto,
  loginInBrowser,
  randomPlate,
  setTheme,
  signUpApi,
  unique,
} from "./helpers";
import { checkerPhoto, inner, type Rect, regionSpread, storedPhoto } from "./helpers/lot51";
import { RELAIS } from "./relais";

// Lot 51, côté site : floutage de la plaque à la main (pas de détection automatique sur le site). Ajout d'un véhicule
// avec un cadre posé sur la photo choisie, puis floutage après coup d'une photo déjà en ligne depuis la page du
// véhicule ; la photo stockée est floutée dans le cadre et nette ailleurs (pixels lus via l'API). Deux thèmes.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-51-captures/site`;
const WIDE = { width: 1280, height: 900 } as const;

type Theme = "beton" | "sable";

async function shot(page: Page, name: string, theme: Theme) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}-${theme}.png`, fullPage: true });
}

/** Le cadre, en fraction de la photo affichée. */
async function frameRect(page: Page, scope: string): Promise<Rect> {
  const editor = page.getByTestId(scope).first();
  const photo = await editor.locator(".g-plate__photo").boundingBox();
  const frame = await editor.getByTestId("site-plate-frame").first().boundingBox();
  if (!photo || !frame) throw new Error("Cadre ou photo introuvable");
  return {
    x: (frame.x - photo.x) / photo.width,
    y: (frame.y - photo.y) / photo.height,
    w: frame.width / photo.width,
    h: frame.height / photo.height,
  };
}

/** Glisse le cadre de (dx, dy) pixels, puis l'agrandit par son coin de (gx, gy). */
async function dragFrame(page: Page, scope: string, dx: number, dy: number, gx = 0, gy = 0) {
  const editor = page.getByTestId(scope).first();
  const frame = await editor.getByTestId("site-plate-frame").first().boundingBox();
  if (!frame) throw new Error("cadre absent");
  const cx = frame.x + frame.width / 2;
  const cy = frame.y + frame.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(cx + (dx * i) / 8, cy + (dy * i) / 8);
  await page.mouse.up();
  if (gx || gy) {
    const handle = await editor.getByTestId("site-plate-handle").first().boundingBox();
    if (!handle) throw new Error("coin absent");
    const hx = handle.x + handle.width / 2;
    const hy = handle.y + handle.height / 2;
    await page.mouse.move(hx, hy);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(hx + (gx * i) / 8, hy + (gy * i) / 8);
    await page.mouse.up();
  }
}

async function firstPhoto(cookie: Cookie, vehicleId?: string) {
  const res = await apiCall<{ id: string; photos: { id: string; url: string; plateBlurred: boolean }[] }[]>(
    cookie,
    "GET",
    "/me/vehicles",
  );
  const v = vehicleId ? res.data.find((x) => x.id === vehicleId) : res.data[0];
  return { vehicle: v, photo: v?.photos[0] };
}

async function expectBlurred(url: string, rect: Rect) {
  const stored = await storedPhoto(url);
  expect(await regionSpread(stored, { x: 0.02, y: 0.02, w: 0.15, h: 0.15 }), "hors du cadre : net").toBeGreaterThan(60);
  expect(await regionSpread(stored, inner(rect)), "dans le cadre : flouté").toBeLessThan(25);
}

for (const theme of ["beton", "sable"] as Theme[]) {
  test(`site : floutage de la plaque à la main, à l'ajout puis après coup (${theme})`, async ({ browser }) => {
    test.setTimeout(180_000);
    const pseudo = `Site51_${unique()}`.slice(0, 20);
    const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
    const cookie = await signUpApi(pseudo, email);
    const ctx = await browser.newContext({ viewport: WIDE });
    const page = await ctx.newPage();
    await setTheme(page, theme);
    await loginInBrowser(page, email, undefined, "/app/garage/nouveau");

    // Ajout : la photo choisie s'affiche, on pose le cadre, on le place.
    await page.getByLabel("Marque").selectOption({ label: "Toyota" });
    await expect(page.getByLabel("Modèle").locator('option:text-is("Supra")')).toHaveCount(1);
    await page.getByLabel("Modèle").selectOption({ label: "Supra" });
    await page.getByLabel("Numéro de plaque").fill(randomPlate());
    await chooseSitePhoto(page, { name: "supra.png", mimeType: "image/png", buffer: checkerPhoto() });
    const editor = page.getByTestId("new-plate-frame");
    await expect(editor).toBeVisible();
    await expect(editor.getByText("Place le cadre sur la plaque")).toBeVisible();
    await editor.getByRole("button", { name: "Poser un cadre" }).click();
    await dragFrame(page, "new-plate-frame", -60, 30, 40, 20);
    const rect = await frameRect(page, "new-plate-frame");
    expect(rect.w).toBeGreaterThan(0.3);
    await expect(editor.getByText("1 plaque floutée")).toBeVisible();
    const audit = await auditPage(page);
    expect(audit.greens).toEqual([]);
    expect(audit.horizontalScroll).toBe(false);
    await shot(page, "01-ajout-cadre", theme);
    await page.getByRole("button", { name: "Envoyer", exact: true }).click();
    await page.waitForURL(/\/app\/garage$/, { timeout: 30_000 });
    const added = await firstPhoto(cookie);
    expect(added.photo?.plateBlurred).toBe(true);
    await expectBlurred(added.photo?.url ?? "", rect);

    // Après coup : une photo nette ajoutée depuis la page du véhicule, floutée à la main.
    const vehicleId = added.vehicle?.id as string;
    await page.goto(`/app/garage/${vehicleId}`);
    await expect(page.getByTestId("photo-plate-blurred")).toHaveCount(1);
    await page.getByLabel("Ajouter une photo").setInputFiles({
      name: "arriere.png",
      mimeType: "image/png",
      buffer: checkerPhoto(),
    });
    // Relecture : la photo ajoutée passe par l'éditeur ; ici « aucune plaque visible », pour la flouter après coup.
    await expect(page.getByTestId("add-plate-frame")).toBeVisible();
    // Lot M2, tour 2 : « Envoyer sans flouter » se confirme sur la photo.
    await page.getByTestId("site-no-plate").click();
    await expect(page.getByTestId("site-no-plate-confirm").getByRole("img")).toBeVisible();
    await page.getByTestId("site-no-plate-yes").click();
    await expect(page.getByTestId("site-no-plate")).toBeChecked();
    await page.getByRole("button", { name: "Envoyer la photo" }).click();
    await expect(page.getByTestId("photo-blur")).toHaveCount(1, { timeout: 30_000 });
    // Une photo déjà floutée peut recevoir un autre cadre.
    await expect(page.getByTestId("photo-blur-more")).toHaveCount(1);
    await page.getByTestId("photo-blur").getByText("Flouter la plaque").click();
    const after = page.getByTestId("site-plate-editor");
    await expect(after).toBeVisible();
    await dragFrame(page, "site-plate-editor", 50, -40);
    const rect2 = await frameRect(page, "site-plate-editor");
    await shot(page, "02-page-vehicule-cadre", theme);
    await page.getByRole("button", { name: "Flouter définitivement" }).click();
    await expect(page.getByTestId("photo-plate-blurred")).toHaveCount(2, { timeout: 30_000 });
    await expect(page.getByTestId("photo-blur")).toHaveCount(0);
    await shot(page, "03-page-vehicule-floutee", theme);
    const v = await apiCall<{ photos: { url: string; plateBlurred: boolean }[] }>(
      cookie,
      "GET",
      `/me/vehicles/${vehicleId}`,
    );
    expect(v.data.photos.map((p) => p.plateBlurred)).toEqual([true, true]);
    await expectBlurred(v.data.photos[1]?.url ?? "", rect2);
    await ctx.close();
  });
}
