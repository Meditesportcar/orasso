import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  apiCall,
  chooseSitePhoto,
  login,
  loginInBrowser,
  MOBILE,
  randomPlate,
  SEED_PASSWORD,
  samplePhoto,
  seeStepEnd,
  setTheme,
  signUpApi,
  unique,
} from "./helpers";
import { RELAIS } from "./relais";

// Lot R4a : paires de captures avant / après des écrans touchés, à lancer sur la branche telle que reçue (`CAPTURES_DIR`
// = …/lot-r4a-captures/avant) puis après le lot (…/apres). Étape Plaque (cadre posé, geste), étape Marque et modèle
// (« 207 » cherché chez Peugeot, « Autre »), mêmes sections du site (390 et 1 280 px), file admin de /admin/vehicules
// (1 280 px). Béton et Sable. Seulement des captures : les règles se vérifient dans `appli-lotr4a` et `lotr4a-site`.
// Photo de voiture : `M1_PHOTOS` (dossier avec supra.jpg), sinon un aplat.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r4a-captures/apres`;
test.use({ actionTimeout: 30_000 });

function carPhoto(): { name: string; mimeType: string; buffer: Buffer } {
  const dir = process.env.M1_PHOTOS;
  if (dir && existsSync(`${dir}/supra.jpg`))
    return { name: "supra.jpg", mimeType: "image/jpeg", buffer: readFileSync(`${dir}/supra.jpg`) };
  return { name: "a.png", mimeType: "image/png", buffer: samplePhoto([150, 150, 160]) };
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function appPage(browser: Browser, theme: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  return page;
}

async function skipOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

/** Une fiche « Peugeot › Autre » d'un autre compte, pour que la file de l'admin ne soit pas vide. */
async function otherVehicle() {
  const cookie = await signUpApi(`Avr4a${unique()}`.slice(0, 20));
  const makes = await apiCall<{ id: string; name: string }[]>(cookie, "GET", "/vehicle-reference/makes");
  const peugeot = makes.data.find((m) => m.name === "Peugeot");
  const models = await apiCall<{ id: string; isOther: boolean }[]>(
    cookie,
    "GET",
    `/vehicle-reference/makes/${peugeot?.id}/models`,
  );
  const other = models.data.find((m) => m.isOther);
  const res = await apiCall(cookie, "POST", "/me/vehicles", {
    vehicleType: "car",
    makeId: peugeot?.id,
    modelId: other?.id,
    plate: randomPlate(),
    // Après le lot : le nom tapé (ignoré avant, la clé n'existait pas : retirée si l'API la refuse).
    proposedModel: "207 CC",
  });
  if (res.status !== 201) {
    await apiCall(cookie, "POST", "/me/vehicles", {
      vehicleType: "car",
      makeId: peugeot?.id,
      modelId: other?.id,
      plate: randomPlate(),
    });
  }
}

test("R4a : captures avant / après (Plaque, Marque et modèle, site, admin)", async ({ browser }) => {
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  await otherVehicle();
  const pseudo = `Avr4b${unique()}`.slice(0, 20);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  await signUpApi(pseudo, email);

  if (APP) {
    for (const theme of ["beton", "sable"]) {
      const page = await appPage(browser, theme);
      await page.goto("/auth");
      await skipOpening(page);
      await page.getByLabel("E-mail").fill(email);
      await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
      await page.getByRole("button", { name: "Me connecter" }).click();
      await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 30_000 });
      await page.goto("/vehicule/nouveau");
      await skipOpening(page);
      const chooser = page.waitForEvent("filechooser");
      await page.getByTestId("vehicle-photo-add").click();
      await (await chooser).setFiles([carPhoto()]);
      await expect(page.getByTestId("crop-validate")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("crop-validate").click();
      await expect(page.getByTestId("new-vehicle-photos").getByText("Couverture")).toBeVisible({ timeout: 20_000 });
      await seeStepEnd(page);
      await page.getByTestId("vehicle-step-next").click();
      await expect(page.getByText("Étape 2 sur 5 · Plaque")).toBeVisible();
      await page.waitForTimeout(1500);
      if ((await page.getByTestId("plate-frame").count()) === 0) await page.getByTestId("plate-frame-add").click();
      await page.getByTestId("plate-editor").scrollIntoViewIfNeeded();
      await shot(page, `appli-plaque-cadre-${theme}`);
      const frame = await page.getByTestId("plate-frame").first().boundingBox();
      if (frame) {
        await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
        await page.mouse.down();
        await page.mouse.move(frame.x + frame.width / 2 - 30, frame.y + frame.height / 2 - 20, { steps: 8 });
        await shot(page, `appli-plaque-geste-${theme}`);
        await page.mouse.up();
        // Après le lot : toucher le cadre passe à Rotation, puis à Taille (avant : sans effet).
        const moved = await page.getByTestId("plate-frame").first().boundingBox();
        if (moved) {
          await page.mouse.click(moved.x + moved.width / 2, moved.y + moved.height / 2);
          await shot(page, `appli-plaque-rotation-${theme}`);
          await page.mouse.click(moved.x + moved.width / 2, moved.y + moved.height / 2);
          await shot(page, `appli-plaque-taille-${theme}`);
          await page.mouse.click(moved.x + moved.width / 2, moved.y + moved.height / 2);
        }
      }
      await page.getByTestId("plate-strip").scrollIntoViewIfNeeded();
      await shot(page, `appli-plaque-vignette-${theme}`);
      await page.getByTestId("vehicle-plate").fill(randomPlate());
      await seeStepEnd(page);
      await page.getByTestId("vehicle-step-next").click();
      await expect(page.getByText("Étape 3 sur 5 · Marque et modèle")).toBeVisible();
      await page.getByLabel("Marque ou modèle").fill("peugeot");
      await page.getByRole("radio", { name: "Peugeot", exact: false }).first().click();
      await page.getByLabel("Marque ou modèle").fill("207");
      await page.waitForTimeout(1200);
      await shot(page, `appli-modele-recherche-207-${theme}`);
      await page.getByLabel("Marque ou modèle").fill("");
      await page.getByTestId("ref-other").first().click();
      await page.waitForTimeout(800);
      const field = page.getByLabel("Nom du modèle");
      if (await field.isVisible().catch(() => false)) await field.fill("207 CC");
      await page.waitForTimeout(500);
      await shot(page, `appli-modele-autre-${theme}`);
      await page.context().close();
    }
  }

  for (const theme of ["beton", "sable"] as const) {
    for (const width of [390, 1280]) {
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, email, undefined, "/app/garage/nouveau");
      await chooseSitePhoto(page, carPhoto());
      const plate = page.getByTestId("new-plate-frame");
      await expect(plate).toBeVisible();
      if ((await page.getByTestId("site-plate-frame").count()) === 0)
        await plate.getByRole("button", { name: /Poser un cadre|Cadre/ }).first().click();
      await plate.scrollIntoViewIfNeeded();
      await shot(page, `site-plaque-cadre-${width}-${theme}`);
      const box = await page.getByTestId("site-plate-frame").first().boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await shot(page, `site-plaque-taille-${width}-${theme}`);
      }
      await page.getByLabel("Marque", { exact: true }).selectOption({ label: "Peugeot" });
      const modelSelect = page.getByLabel("Modèle", { exact: true });
      await expect(modelSelect.locator("option")).not.toHaveCount(1);
      const other = modelSelect.locator("option", { hasText: /Autre|pas dans la liste/ });
      await modelSelect.selectOption((await other.first().getAttribute("value")) as string);
      const field = page.getByLabel("Nom du modèle");
      if (await field.isVisible().catch(() => false)) await field.fill("207 CC");
      await page.getByTestId("add-identity").scrollIntoViewIfNeeded();
      await shot(page, `site-modele-autre-${width}-${theme}`);
      await ctx.close();
    }
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await setTheme(page, theme);
    await login("damien@orasso.local");
    await loginInBrowser(page, "damien@orasso.local", undefined, "/admin/vehicules");
    await page.goto("/admin/vehicules");
    await page.waitForTimeout(1000);
    await shot(page, `site-admin-vehicules-1280-${theme}`);
    await page.screenshot({ path: `${DIR}/site-admin-vehicules-1280-${theme}-page.png`, fullPage: true });
    await ctx.close();
  }
});
