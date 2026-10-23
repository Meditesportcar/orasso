// Lot M1 : adapté au nouvel ordre de l'ajout (photos → plaque → marque…) ; les messages sont sur la photo.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, type Cookie, MOBILE, SEED_PASSWORD, signUpApi, unique } from "./helpers";
import { checkerPhoto } from "./helpers/lot51";
import { RELAIS } from "./relais";

// Lot M2, côté appli (version web de recette) : la partie logique de l'étape Plaque. Pas de ML Kit dans le navigateur :
// la détection et le préremplissage sont couverts par les tests unitaires (`lib/plates`, `plateStep`). Ici :
// « Envoyer sans flouter » confirmé sur la photo, message de l'étape qui se relit tout seul, numéro obligatoire,
// avertissement d'un format étranger, plaque stockée sous une forme unique et rendue lisible. Photo de test :
// M2_PHOTO (la Nissan « W-623-AX » des retours de Damien), sinon un damier.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-m2-captures`;
test.skip(!APP, "Appli : lancer avec APP_URL");

const PHOTO = process.env.M2_PHOTO;

async function open(browser: Browser) {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", "beton");
  });
  return { ctx, page };
}

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

const next = (page: Page) => page.getByTestId("vehicle-step-next").click();
const message = (page: Page) => page.getByTestId("plate-message");

test("étape Plaque : sans flouter confirmé sur la photo, message vivant, numéro obligatoire et lisible", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const pseudo = `PlaqueM2_${unique()}`.slice(0, 20);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie: Cookie = await signUpApi(pseudo, email);
  const { ctx, page } = await open(browser);
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 30_000 });

  await page.goto("/vehicule/nouveau");
  await afterOpening(page);
  // Nouvel ordre : photos (recadrage carré) → plaque.
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("vehicle-photo-add").click();
  const file =
    PHOTO && existsSync(PHOTO)
      ? { name: "nissan.jpg", mimeType: "image/jpeg", buffer: readFileSync(PHOTO) }
      : { name: "damier.png", mimeType: "image/png", buffer: checkerPhoto() };
  await (await chooser).setFiles(file);
  await expect(page.getByTestId("square-cropper")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("crop-validate").click();
  await expect(page.getByTestId("new-vehicle-photos").getByText("Couverture")).toBeVisible({ timeout: 20_000 });
  await next(page);

  // Rien de réglé : la photo d'abord, avec son message sur la photo.
  await expect(page.getByTestId("plate-none")).toBeVisible();
  await next(page);
  await expect(message(page)).toContainText("Photo 1 : pose le cadre");
  await shot(page, "01-photo-a-regler");

  // « Aucune plaque » : confirmation sur la photo.
  await page.getByTestId("plate-none").click();
  await expect(page.getByTestId("plate-none-confirm")).toContainText("Aucune plaque visible sur cette photo ?");
  await shot(page, "02-sans-flouter-confirmation");
  await page.getByTestId("plate-none-cancel").click();
  await expect(page.getByTestId("plate-none")).toHaveAttribute("aria-checked", "false");

  // Cadre posé : le message de la photo disparaît tout seul, sans nouvel appui ; le numéro manquant a son message.
  await page.getByTestId("plate-frame-add").click();
  await expect(message(page)).toHaveCount(0);
  await next(page);
  await expect(page.getByTestId("vehicle-plate-error")).toContainText("Indique le numéro de plaque");
  await shot(page, "03-numero-obligatoire");

  // Format étranger : simple avertissement ; format W garage saisi n'importe comment : aucun avertissement.
  await page.getByTestId("vehicle-plate").fill("m-ab 1234");
  await expect(page.getByText("Ce n'est pas un format français").first()).toBeVisible();
  await expect(page.getByTestId("vehicle-plate-error")).toHaveCount(0);
  await shot(page, "04-plaque-etrangere-avertissement");
  const plate = `W-${100 + Math.floor(Math.random() * 900)}-AX`;
  await page.getByTestId("vehicle-plate").fill(plate.replaceAll("-", " ").toLowerCase());
  await expect(page.getByText("Ce n'est pas un format français")).toHaveCount(0);
  await shot(page, "05-w-garage-saisi");
  await expect(page.getByTestId("vehicle-plate-error")).toHaveCount(0);
  // Plaque réglée : le reste de l'ajout (marque, fiche, catégories) jusqu'à l'envoi.
  await next(page);
  await page.getByLabel("Marque ou modèle").fill("toyota");
  await page.getByRole("radio", { name: "Toyota", exact: false }).first().click();
  await page.getByRole("radio", { name: "Supra", exact: false }).first().click();
  await page.getByRole("radio", { name: "Mk5", exact: false }).first().click();
  await next(page);
  await page.getByTestId("vehicle-year-2021").click();
  await next(page);
  await next(page);
  await expect(page.getByTestId("vehicle-done-title")).toBeVisible({ timeout: 60_000 });

  const mine = await apiCall<{ plate: string | null }[]>(cookie, "GET", "/me/vehicles");
  expect(mine.data[0]?.plate).toBe(plate);
  await ctx.close();
});
