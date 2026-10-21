import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { apiCall, type Cookie, MOBILE, randomPlate, SEED_PASSWORD, signUpApi, unique } from "./helpers";
import { checkerPhoto, inner, type Rect, regionSpread, storedPhoto } from "./helpers/lot51";
import { RELAIS } from "./relais";

// Lot 51, côté appli (version web de recette) : ajout de véhicule en cinq étapes (la carte se construit en haut),
// « Autre » sans saisie libre, catégories grisées avec la raison, photo avec cadre de plaque posé à la main (pas de
// ML Kit dans le navigateur : repli « À la main »), envoi, photo stockée floutée dans le cadre et nette ailleurs
// (pixels lus via l'API), garage v2 et modification par les mêmes étapes. Deux thèmes, captures à 390 px.
// Lancer avec APP_URL=http://localhost:8361 (Metro derrière `apps/mobile/scripts/web-isolated.mjs`), API seedée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-51-captures/appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");

type Theme = "beton" | "sable";

async function open(browser: Browser, theme: Theme) {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  return { ctx, page };
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
  await page.waitForURL(/accueil/, { timeout: 30_000 });
}

async function shot(page: Page, name: string, theme: Theme) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DIR}/${name}-${theme}.png` });
}

async function checkDesign(page: Page) {
  const audit = await auditPage(page);
  expect(audit.greens).toEqual([]);
  expect(audit.horizontalScroll).toBe(false);
}

const next = (page: Page) => page.getByTestId("vehicle-step-next").click();
const row = (page: Page, name: string) => page.getByRole("radio", { name, exact: false }).first();

/** Le cadre de plaque, en fraction de la photo affichée. */
async function frameRect(page: Page): Promise<Rect> {
  const editor = await page.getByTestId("plate-editor").boundingBox();
  const frame = await page.getByTestId("plate-frame").first().boundingBox();
  if (!editor || !frame) throw new Error("Cadre ou photo introuvable");
  return {
    x: (frame.x - editor.x) / editor.width,
    y: (frame.y - editor.y) / editor.height,
    w: frame.width / editor.width,
    h: frame.height / editor.height,
  };
}

for (const theme of ["beton", "sable"] as Theme[]) {
  test(`ajout en cinq étapes, cadre à la main, photo floutée par l'API, garage v2 (${theme})`, async ({ browser }) => {
    test.setTimeout(300_000);
    const pseudo = `Flou51_${unique()}`.slice(0, 20);
    const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
    const cookie: Cookie = await signUpApi(pseudo, email);
    const { ctx, page } = await open(browser, theme);
    await signIn(page, email);

    await page.goto("/vehicule/nouveau");
    await afterOpening(page);
    await expect(page.getByRole("heading", { name: "Ta voiture, c'est quoi ?" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Étape 1 sur 5 · Marque et modèle").first()).toBeVisible();

    // « Autre » : aucune saisie libre, seulement la demande à l'équipe ; un seul champ, la recherche.
    await page.getByLabel("Marque ou modèle").fill("zzz introuvable");
    await expect(page.getByTestId("ref-row")).toHaveCount(0);
    await expect(page.getByTestId("ref-other")).toHaveCount(1);
    await expect(page.getByText("Pas dans la liste ? L'équipe Orasso l'ajoute à la base.").first()).toBeVisible();
    await expect(page.getByText("Rien dans la liste Orasso").first()).toBeVisible();
    await expect(page.locator("input:visible, textarea:visible")).toHaveCount(1);
    await shot(page, "01a-autre-sans-saisie", theme);

    // 1. Toyota › Supra › Mk5.
    await page.getByLabel("Marque ou modèle").fill("toyota");
    await row(page, "Toyota").click();
    await row(page, "Supra").click();
    await row(page, "Mk5").click();
    await expect(page.getByTestId("vehicle-live-name")).toHaveText("Toyota Supra");
    await checkDesign(page);
    await shot(page, "01-marque-modele", theme);
    await next(page);

    // 2. Fiche technique : années de la génération en boutons.
    await expect(page.getByText("Étape 2 sur 5 · Fiche technique").first()).toBeVisible();
    await page.getByTestId("vehicle-engine").fill("3.0 L6 turbo");
    await page.getByTestId("vehicle-power").fill("340");
    await page.getByTestId("vehicle-weight").fill("1495");
    await page.getByTestId("vehicle-year-2021").click();
    await page.getByTestId("vehicle-color-Blanche").click();
    await expect(page.getByTestId("vehicle-live-specs")).toHaveText("3.0 L6 turbo · 340 ch · 2021 · blanche");
    await checkDesign(page);
    await shot(page, "02-fiche-technique", theme);
    await next(page);

    // 3. Catégories : origine déduite de Toyota, Youngtimer et Ancienne grisées avec la raison.
    await expect(page.getByTestId("vehicle-origin")).toContainText("JDM");
    await expect(page.getByTestId("vehicle-origin")).toContainText("Déduit de Toyota");
    const youngtimer = page.getByRole("checkbox", { name: /Youngtimer, Véhicule trop récent/ });
    await expect(youngtimer).toBeDisabled();
    await expect(page.getByText("Youngtimer et Ancienne : grisées, ta voiture est de 2021.").first()).toBeVisible();
    await expect(page.getByText("Allemande")).toHaveCount(0);
    await page.getByRole("checkbox", { name: "Sportive", exact: true }).click();
    await checkDesign(page);
    await shot(page, "03-categories", theme);
    await next(page);

    // 4. Photos : au moins une.
    await next(page);
    await expect(page.getByTestId("vehicle-step-error")).toContainText("au moins une photo");
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("vehicle-photo-add").click();
    await (await chooser).setFiles({ name: "supra.png", mimeType: "image/png", buffer: checkerPhoto() });
    await expect(page.getByTestId("new-vehicle-photos").getByText("Couverture")).toBeVisible({ timeout: 20_000 });
    await shot(page, "04-photos", theme);
    await next(page);

    // 5. Plaque : pas de ML Kit dans le navigateur → à la main ; cadre posé puis déplacé.
    await expect(page.getByRole("heading", { name: "Sa plaque, floutée" })).toBeVisible();
    await expect(page.getByText("Pas de repérage automatique ici").first()).toBeVisible();
    // Relecture : sans détection, pas de mode « Automatique » ; une photo sans cadre ne part pas sans confirmation.
    await expect(page.getByText("Automatique", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("plate-none")).toBeVisible();
    await page.getByTestId("vehicle-plate").fill(randomPlate());
    await next(page);
    await expect(page.getByTestId("vehicle-step-error")).toContainText("Photo 1 : place le cadre");
    await shot(page, "05a-plaque-sans-detection", theme);
    await page.getByTestId("plate-frame-add").click();
    await expect(page.getByTestId("plate-none")).toHaveCount(0);
    const frame = page.getByTestId("plate-frame").first();
    await expect(frame).toBeVisible();
    const box = await frame.boundingBox();
    if (!box) throw new Error("cadre absent");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width / 2 - i * 4, box.y + box.height / 2 - i * 3);
    await page.mouse.up();
    const rect = await frameRect(page);
    expect(rect.x).toBeLessThan(0.35);
    await expect(page.getByText("1 plaque floutée").first()).toBeVisible();
    await checkDesign(page);
    await shot(page, "05-plaque-a-la-main", theme);
    await next(page);

    // Envoi : la voiture se gare, la carte entre au garage.
    await expect(page.getByTestId("vehicle-done-title")).toHaveText("Ta Supra est au garage", { timeout: 60_000 });
    await shot(page, "06-au-garage", theme);

    // La photo stockée est floutée dans le cadre, nette ailleurs (pixels lus via l'API).
    const mine = await apiCall<{ id: string; photos: { url: string; plateBlurred: boolean }[] }[]>(
      cookie,
      "GET",
      "/me/vehicles",
    );
    const vehicle = mine.data[0];
    expect(vehicle?.photos[0]?.plateBlurred).toBe(true);
    const stored = await storedPhoto(vehicle?.photos[0]?.url ?? "");
    const blurred = await regionSpread(stored, inner(rect));
    const sharp = await regionSpread(stored, { x: 0.02, y: 0.02, w: 0.2, h: 0.2 });
    expect(sharp, "hors du cadre : le damier reste net").toBeGreaterThan(60);
    expect(blurred, "dans le cadre : la plaque est floutée").toBeLessThan(25);

    // Garage v2 : grand titre, carte, chiffres étroits, partage, ajout.
    await page.getByTestId("vehicle-done-explore").click();
    await page.waitForURL(/explorer/, { timeout: 30_000 });
    await page.goto("/garage");
    await afterOpening(page);
    await expect(page.getByRole("heading", { name: "Mon garage" }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("1 véhicule").first()).toBeVisible();
    await expect(page.getByTestId("garage-card-name")).toHaveText("Toyota Supra Mk5");
    await expect(page.getByText("3.0 L6 turbo · 2021 · blanche").first()).toBeVisible();
    await expect(page.getByText("Partager sa carte").first()).toBeVisible();
    await expect(page.getByText("Marque, photos, plaque floutée : deux minutes.").first()).toBeVisible();
    await checkDesign(page);
    await shot(page, "07-garage", theme);

    // Photo ajoutée après la création (relecture) : éditeur du cadre avant l'envoi, photo 9:16 montrée entière.
    await page.getByTestId("garage-card").click();
    await page.waitForURL(/\/vehicule\//, { timeout: 30_000 });
    const tall = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Ajouter une photo" }).click();
    await (await tall).setFiles({ name: "debout.png", mimeType: "image/png", buffer: checkerPhoto(360, 640) });
    const editor = page.getByTestId("blur-editor");
    await expect(editor).toBeVisible({ timeout: 20_000 });
    const tallBox = await editor.boundingBox();
    expect((tallBox?.width ?? 0) / (tallBox?.height ?? 1)).toBeCloseTo(360 / 640, 1);
    await expect(page.getByTestId("blur-confirm")).toBeDisabled();
    await page.getByTestId("blur-frame-add").click();
    await shot(page, "09-photo-ajoutee-cadre", theme);
    await page.getByTestId("blur-confirm").click();
    await expect(page.getByTestId("blur-editor")).toHaveCount(0, { timeout: 30_000 });
    const after = await apiCall<{ photos: { url: string; width: number; height: number; plateBlurred: boolean }[] }>(
      cookie,
      "GET",
      `/me/vehicles/${vehicle?.id}`,
    );
    expect(after.data.photos).toHaveLength(2);
    expect(after.data.photos[1]?.plateBlurred).toBe(true);
    expect(after.data.photos[1]?.height).toBeGreaterThan(after.data.photos[1]?.width ?? 0);
    await page.goto("/garage");
    await afterOpening(page);

    // Modification par les mêmes étapes, préremplies.
    await page.getByTestId("garage-edit").click();
    await expect(page.getByTestId("vehicle-live-name")).toHaveText("Toyota Supra", { timeout: 30_000 });
    await expect(row(page, "Mk5")).toHaveAttribute("aria-checked", "true");
    await shot(page, "08-modifier", theme);
    await ctx.close();
  });
}
