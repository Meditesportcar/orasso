import { mkdirSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { auditPage } from "./audit";
import { apiCall, chooseSitePhoto, loginInBrowser, randomPlate, setTheme, signUpApi, unique } from "./helpers";
import { checkerPhoto, storedPhoto } from "./helpers/lot51";
import { RELAIS } from "./relais";

// Lot M1 : l'ajout de véhicule du site applique les mêmes règles, les mêmes mots et le même ordre que l'appli. Un
// véhicule complet (photo recadrée au carré, plaque, Toyota › Supra › Mk5, motorisation du catalogue, teinte, description,
// préparation) est ajouté par le formulaire, puis relu par l'API.

type Photo = { id: string; url: string; width: number; height: number };
type Vehicle = {
  id: string;
  color: string | null;
  description: string | null;
  preparation: string | null;
  powerHp: number | null;
  weightKg: number | null;
  engine: string | null;
  year: number | null;
  categories: { id: string; label: string }[];
  photos: Photo[];
};

test("ajout complet d'un véhicule sur le site, photo carrée, fiche technique et préparation", async ({ browser }) => {
  const pseudo = `M1Site_${unique()}`.slice(0, 20);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo, email);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await loginInBrowser(page, email, undefined, "/app/garage/nouveau");

  // Les cinq sections, dans l'ordre de l'appli.
  await expect(page.getByTestId("vehicle-add-form").getByRole("heading", { level: 2 })).toHaveText([
    "1 · Photos",
    "2 · Plaque",
    "3 · Marque et modèle",
    "4 · Fiche technique",
    "5 · Catégories",
  ]);

  // 1 · Photos : la photo s'ouvre dans le recadrage carré (cadre fixe, zoom ×1 à ×2,5), puis part en carré.
  await page.getByLabel("Photo", { exact: true }).setInputFiles({
    name: "supra.png",
    mimeType: "image/png",
    buffer: checkerPhoto(640, 480),
  });
  const crop = page.getByTestId("site-crop");
  await expect(crop).toBeVisible();
  await expect(crop.getByRole("heading", { name: "Recadrer" })).toBeVisible();
  await expect(page.getByTestId("site-crop-zoom")).toHaveText("×1,0");
  await page.getByTestId("site-crop-in").click();
  await expect(page.getByTestId("site-crop-zoom")).toHaveText("×1,3");
  // On glisse la photo à la souris : le cadre reste carré et le zoom ne change pas.
  const frame = await page.getByTestId("site-crop-frame").boundingBox();
  if (!frame) throw new Error("cadre de recadrage absent");
  expect(Math.round(frame.width)).toBe(Math.round(frame.height));
  await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
  await page.mouse.down();
  await page.mouse.move(frame.x + frame.width / 2 - 40, frame.y + frame.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(crop.getByText("Vignette")).toBeVisible();
  await expect(crop.getByText("Fiche", { exact: true })).toBeVisible();
  await crop.getByRole("button", { name: "Annuler" }).click();
  await expect(crop).toHaveCount(0);
  await expect(page.getByTestId("new-plate-frame")).toHaveCount(0);
  await chooseSitePhoto(page, { name: "supra.png", mimeType: "image/png", buffer: checkerPhoto(640, 480) });
  await expect(page.getByTestId("add-cert")).toContainText("3 photos conseillées");
  await expect(page.getByTestId("add-cert")).toContainText("il en faut 3 pour demander la certification");
  await page.getByTestId("site-no-plate").click();
  await page.getByTestId("site-no-plate-yes").click();

  // 2 · Plaque : numéro obligatoire (privé), ancien véhicule, non immatriculé, note de vie privée.
  const plate = page.getByTestId("add-plate");
  await expect(plate.getByLabel("Numéro de plaque · privé")).toBeVisible();
  await expect(plate).toContainText("Le numéro reste privé");
  await plate.getByLabel("Numéro de plaque · privé").fill(randomPlate());
  await plate.getByLabel("C'est un ancien véhicule").check();
  await expect(page.getByTestId("add-former")).toContainText("Un ancien véhicule ne peut pas être certifié.");
  await plate.getByLabel("C'est un ancien véhicule").uncheck();

  // 3 · Marque et modèle : Toyota › Supra › Mk5.
  await page.getByTestId("add-types").getByRole("radio", { name: "Voiture" }).check();
  await page.getByLabel("Marque", { exact: true }).selectOption({ label: "Toyota" });
  await expect(page.getByLabel("Modèle", { exact: true }).locator('option:text-is("Supra")')).toHaveCount(1);
  await page.getByLabel("Modèle", { exact: true }).selectOption({ label: "Supra" });
  const mk5 = page.getByLabel("Génération", { exact: true }).locator("option", { hasText: "Mk5" });
  await expect(mk5).toHaveCount(1);
  await page.getByLabel("Génération", { exact: true }).selectOption((await mk5.getAttribute("value")) as string);

  // 4 · Fiche technique : motorisation du catalogue → puissance 340 et poids 1 495.
  const engines = page.getByTestId("add-engines");
  await expect(engines).toBeVisible();
  await expect(engines.getByTestId("add-engine-other")).toBeAttached();
  const card = engines.locator("label", { hasText: "340 ch" }).first();
  await expect(card).toContainText("1 495 kg");
  await card.click();
  await expect(card).toHaveClass(/is-on/);
  await page.getByTestId("add-year-2021").click();
  await page.getByTestId("site-color-family-grey").click();
  await page.getByRole("radio", { name: /Gris acier/ }).check();
  await expect(page.getByTestId("site-color-name")).toContainText("Gris acier");
  await page.getByLabel("Description", { exact: true }).fill("Supra Mk5 d'origine, entretien suivi, sortie circuit.");
  await expect(page.getByTestId("add-description-count")).toContainText("/ 600");
  await page.getByTestId("add-prep-wheels").check();

  // 5 · Catégories : origine déduite de la marque, « Préparée » cochée d'office par la préparation.
  await expect(page.getByTestId("add-origin")).toContainText("Japonaise");
  await expect(page.getByTestId("add-origin")).toContainText("JDM · déduit de Toyota");
  await expect(page.getByTestId("categories").getByRole("checkbox", { name: "Préparée" })).toBeChecked();
  await expect(page.getByTestId("add-styles-note")).toContainText("Préparée est cochée");
  const audit = await auditPage(page);
  expect(audit.greens).toEqual([]);
  expect(audit.horizontalScroll).toBe(false);
  expect(audit.buttonsWithoutIcon).toEqual([]);

  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await page.waitForURL(/\/app\/garage$/, { timeout: 30_000 });

  const list = await apiCall<Vehicle[]>(cookie, "GET", "/me/vehicles");
  const added = list.data[0];
  if (!added) throw new Error("véhicule absent du garage");
  expect(added.color).toBe("Gris acier");
  expect(added.preparation).toBe("Jantes");
  expect(added.description).toBe("Supra Mk5 d'origine, entretien suivi, sortie circuit.");
  expect(added.powerHp).toBe(340);
  expect(added.weightKg).toBe(1495);
  expect(added.year).toBe(2021);
  expect(added.categories.map((c) => c.label)).toEqual(expect.arrayContaining(["JDM", "Préparée"]));
  // La photo stockée est carrée.
  const photo = added.photos[0];
  if (!photo) throw new Error("photo absente");
  expect(photo.width).toBe(photo.height);
  const meta = await sharp(await storedPhoto(photo.url)).metadata();
  expect(meta.width).toBe(meta.height);
  await ctx.close();
});

test("un ancien véhicule s'ajoute sans plaque ni photo, et la teinte libre part telle quelle", async ({ browser }) => {
  const pseudo = `M1Old_${unique()}`.slice(0, 20);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo, email);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await loginInBrowser(page, email, undefined, "/app/garage/nouveau");
  await page.getByLabel("C'est un ancien véhicule").check();
  await page.getByLabel("Il est…").selectOption({ label: "Souvenir" });
  await page.getByLabel("Marque", { exact: true }).selectOption({ label: "BMW" });
  await expect(page.getByLabel("Modèle", { exact: true })).toBeEnabled();
  await page.getByLabel("Modèle", { exact: true }).selectOption({ index: 1 });
  await page.getByTestId("site-color-other").click();
  await page.getByLabel("Sa teinte").fill("Bleu Laguna");
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await page.waitForURL(/\/app\/garage\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  const list = await apiCall<(Vehicle & { status: string })[]>(cookie, "GET", "/me/vehicles");
  expect(list.data[0]?.color).toBe("Bleu Laguna");
  expect(list.data[0]?.status).toBe("keepsake");
  await ctx.close();
});

// Captures du site (consigne « Le site raccord ») : Béton et Sable, 390 et 1280 px, page vide puis photo posée avec
// son cadre de plaque masqué en noir, regardées à chaque lot.
const SITE_DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-m1-captures/site`;
const PHOTO = process.env.M1_PHOTOS ? `${process.env.M1_PHOTOS}/supra.jpg` : null;

for (const theme of ["beton", "sable"] as const) {
  for (const width of [390, 1280] as const) {
    test(`captures du site (${theme}, ${width} px)`, async ({ browser }) => {
      const pseudo = `M1Cap_${unique()}`.slice(0, 20);
      const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
      await signUpApi(pseudo, email);
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, email, undefined, "/app/garage/nouveau");
      mkdirSync(SITE_DIR, { recursive: true });
      await expect(page.getByTestId("vehicle-add-form")).toBeVisible();
      await page.screenshot({ path: `${SITE_DIR}/fin-${theme}-${width}-vide.png`, fullPage: true });
      await chooseSitePhoto(
        page,
        PHOTO
          ? { name: "supra.jpg", mimeType: "image/jpeg", buffer: readFileSync(PHOTO) }
          : { name: "damier.png", mimeType: "image/png", buffer: checkerPhoto(640, 480) },
      );
      await page.getByRole("button", { name: "Poser un cadre" }).click();
      await expect(page.getByTestId("site-plate-frame").first()).toBeVisible();
      await page.getByTestId("site-plate-frame").first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SITE_DIR}/fin-${theme}-${width}-plaque.png` });
      await ctx.close();
    });
  }
}
