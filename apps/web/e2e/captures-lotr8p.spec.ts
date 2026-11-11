import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { phaseDir, RELAIS } from "./relais";

// Lot R8p : captures « avant » / « après » de l'écran « Publier au Fil ». Appli (version compilée, `APP_URL`) : Béton et
// Sable, 384 et 390 px, police ×1 et ×1,3 ; site (API et site lancés) : 390 et 1280 px. PHASE=avant|apres. Les photos sont
// celles du seed (jamais la galerie personnelle). « Avant » : l'écran actuel, vide, avec photo, avec événement. « Après » :
// les mêmes, plus chaque casquette, l'affiche comme visuel, « Info importante » cochée, le plafond atteint.
const PHASE = process.env.PHASE ?? "apres";
const APP = process.env.APP_URL;
const DIR = phaseDir(`${RELAIS}/lot-r8p-captures/${PHASE}`, PHASE);
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
  await page.goto("/fil/publier");
  await afterOpening(page);
  await expect(page.getByTestId("fil-publish")).toBeVisible({ timeout: 30_000 });
  return { ctx, page };
}

async function shot(page: Page, name: string, full = true) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: full });
}

/** La page de l'appli défile dans sa zone : on agrandit la fenêtre à la hauteur du contenu pour une capture entière. */
async function tall(page: Page, height = 2600) {
  await page.setViewportSize({ width: page.viewportSize()?.width ?? 390, height });
  await page.waitForTimeout(600);
}

async function addPhoto(page: Page, names = ["car-golf-gti.jpg"]) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("fil-publish-add").click();
  await (await chooser).setFiles(names.map(photo));
  await expect(page.getByTestId("fil-publish-photo")).toHaveCount(names.length, { timeout: 60_000 });
}

async function noPlate(page: Page, count: number) {
  for (let i = 0; i < count; i++) {
    await page.getByTestId("fil-publish-photo").nth(i).click();
    await page.getByTestId("fil-publish-none").click();
    await page.getByTestId("fil-publish-none-yes").click();
  }
}

for (const theme of ["beton", "sable"]) {
  for (const width of [384, 390]) {
    for (const scale of [1, 1.3]) {
      test(`appli ${theme} ${width} police ${scale}`, async ({ browser }) => {
        test.skip(!APP, "Appli : lancer avec APP_URL");
        test.setTimeout(300_000);
        const tag = `${theme}-${width}-x${String(scale).replace(".", "")}`;
        // Un compte avec deux casquettes (passionné + structure) : l'écran complet.
        const { ctx, page } = await open(browser, "damien@orasso.local", theme, width, scale);
        await tall(page);
        await shot(page, `vide-${tag}`);
        await addPhoto(page);
        await noPlate(page, 1);
        await page.getByTestId("fil-publish-caption").fill("Prête pour samedi, on se retrouve au port");
        await shot(page, `avec-photo-${tag}`);
        if (PHASE === "avant") {
          const chip = page.getByRole("button", { name: /Nocturne de Canet|Rassemblement du Lydia/ }).first();
          if (await chip.isVisible().catch(() => false)) await chip.click();
          await shot(page, `avec-evenement-${tag}`);
        }
        await ctx.close();
      });
    }
  }
}

for (const theme of ["beton", "sable"] as const) {
  for (const width of [390, 1280]) {
    test(`site ${theme} ${width}`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width, height: 900 });
      await setTheme(page, theme);
      await loginInBrowser(page, "damien@orasso.local", undefined, "/app/fil/publier");
      await expect(page.getByTestId("fil-publish")).toBeVisible();
      await shot(page, `site-vide-${theme}-${width}`);
      await page.getByTestId("fil-publish-file").setInputFiles([photo("car-golf-gti.jpg")]);
      await expect(page.getByTestId("fil-publish-photo")).toHaveCount(1, { timeout: 60_000 });
      await page.getByTestId("fil-publish-none").click();
      await page.getByTestId("fil-publish-none-yes").click();
      await page.getByTestId("fil-publish-caption").fill("Prête pour samedi, on se retrouve au port");
      await shot(page, `site-avec-photo-${theme}-${width}`);
    });
  }
}
