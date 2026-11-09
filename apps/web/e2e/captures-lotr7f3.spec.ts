import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { loginInBrowser, SEED_PASSWORD, seeStepEnd, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7f3 : captures « avant » / « après » des écrans qui partagent le recadreur et le cadre de plaque avec « Publier une
// story » : l'ajout de véhicule (étapes Photos et Plaque), « Publier au Fil » et le Fil, appli (384 px police 1, 390 px
// police 1,3 ; Béton et Sable) et site (390 et 1280 px). PHASE=avant|apres. Photos de démonstration du seed seulement
// (plaques déjà floutées) : aucune plaque lisible.
const PHASE = process.env.PHASE ?? "apres";
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7f3-captures/${PHASE}`;
const PHOTOS = resolve(import.meta.dirname, "../../api/scripts/seed/assets/photos");
const photo = (name: string) => ({ name, mimeType: "image/jpeg", buffer: readFileSync(`${PHOTOS}/${name}`) });
test.use({ actionTimeout: 30_000 });

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string, theme: string, width: number, scale: number) {
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

async function shot(page: Page, name: string, fullPage = false) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
}

const SIZES = [
  { w: 384, s: 1 },
  { w: 390, s: 1.3 },
] as const;

for (const theme of ["beton", "sable"]) {
  for (const { w, s } of SIZES) {
    test(`appli ${theme} ${w} police ${s}`, async ({ browser }) => {
      test.skip(!APP, "Appli : lancer avec APP_URL");
      test.setTimeout(300_000);
      const { ctx, page } = await open(browser, "kenji@orasso.local", theme, w, s);
      const tag = `${theme}-${w}-f${String(s).replace(".", "")}`;
      await page.goto("/fil");
      await afterOpening(page);
      await shot(page, `fil-${tag}`);

      // Publier au Fil : une photo, la plaque à régler (cadre posé).
      await page.goto("/fil/publier");
      await afterOpening(page);
      const chooser = page.waitForEvent("filechooser");
      await page.getByTestId("fil-publish-add").click();
      await (await chooser).setFiles([photo("car-golf-gti.jpg")]);
      await expect(page.getByTestId("fil-publish-photo")).toHaveCount(1, { timeout: 60_000 });
      await page.getByTestId("fil-publish-frame-add").click();
      await shot(page, `fil-publier-${tag}`);

      // Ajout de véhicule : étape Photos (recadreur carré) puis étape Plaque.
      await page.goto("/vehicule/nouveau");
      await afterOpening(page);
      const c2 = page.waitForEvent("filechooser");
      await page.getByTestId("vehicle-photo-add").click();
      await (await c2).setFiles([photo("car-golf-gti.jpg")]);
      await expect(page.getByTestId("square-cropper")).toBeVisible({ timeout: 30_000 });
      await shot(page, `vehicule-recadrage-${tag}`);
      await page.getByTestId("crop-validate").click();
      await expect(page.getByTestId("new-vehicle-photos")).toBeVisible({ timeout: 20_000 });
      await shot(page, `vehicule-photos-${tag}`);
      await seeStepEnd(page);
      await page.getByTestId("vehicle-step-next").click();
      await expect(page.getByTestId("plate-strip")).toBeVisible();
      await seeStepEnd(page);
      await page.getByTestId("vehicle-step-next").click();
      await expect(page.getByTestId("plate-message")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("plate-frame-add").click();
      await shot(page, `vehicule-plaque-${tag}`);
      await ctx.close();
    });
  }
  for (const width of [390, 1280]) {
    test(`site ${theme} ${width}`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width, height: 900 });
      await setTheme(page, theme as "beton" | "sable");
      await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/fil");
      await page.waitForTimeout(1500);
      await shot(page, `site-fil-${theme}-${width}`);
      await page.goto("/app/fil/publier");
      await page.getByTestId("fil-publish-file").setInputFiles([photo("car-golf-gti.jpg")]);
      await expect(page.getByTestId("fil-publish-photo")).toHaveCount(1, { timeout: 60_000 });
      await page
        .getByTestId("fil-publish-plate")
        .getByRole("button", { name: /Poser un cadre/ })
        .click();
      await shot(page, `site-fil-publier-${theme}-${width}`, true);
      await page.goto("/app/garage/nouveau");
      await page.getByLabel("Photo", { exact: true }).setInputFiles(photo("car-golf-gti.jpg"));
      await expect(page.getByTestId("site-crop")).toBeVisible();
      await shot(page, `site-vehicule-recadrage-${theme}-${width}`);
      await page.getByTestId("site-crop-validate").click();
      await expect(page.getByTestId("site-crop")).toHaveCount(0);
      await shot(page, `site-vehicule-${theme}-${width}`, true);
    });
  }
}
