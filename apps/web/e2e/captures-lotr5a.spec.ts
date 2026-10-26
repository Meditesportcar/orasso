import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  apiCall,
  type Cookie,
  loginInBrowser,
  randomPlate,
  SEED_PASSWORD,
  samplePhoto,
  seeStepEnd,
  setTheme,
  signUpApi,
  unique,
} from "./helpers";
import { RELAIS } from "./relais";

// Lot R5a : captures « avant » et « après » des écrans touchés (étape 0 de la méthode), mêmes gestes avant et après :
//   - appli (version web compilée, APP_URL), Béton et Sable, 390 et 384 px : étape Marque et modèle (liste d'une moto,
//     puis une recherche), étape Catégories (voiture, moto, camion), base véhicules de l'administration, et deux voisins
//     qui partagent l'en-tête de parcours et `KeyboardSafe` (première étape de l'ajout, connexion) ;
//   - site, Béton et Sable, 390 et 1 280 px : ajout de véhicule (Marque et modèle, Catégories), « Modifier la fiche »,
//     base véhicules de l'administration.
// `CAPTURES_DIR` : dossier racine (`…/lot-r5a-captures/avant` ou `…/apres`) ; les sous-dossiers `appli` et `site`.
const ROOT = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r5a-captures/apres`;
const APP = process.env.APP_URL;
const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
test.use({ actionTimeout: 30_000 });

type Theme = "beton" | "sable";

async function shot(page: Page, dir: string, name: string) {
  mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${dir}/${name}.png` });
}

/** Un véhicule du référentiel (marque, modèle, génération par leur nom), avec une photo « aucune plaque visible ». */
async function vehicle(
  cookie: Cookie,
  v: { type: "car" | "moto" | "truck"; make: string; model: string; generation?: string; year: number },
): Promise<string> {
  const makes = await apiCall<{ id: string; name: string }[]>(cookie, "GET", "/vehicle-reference/makes");
  const make = makes.data.find((m) => m.name === v.make);
  const models = await apiCall<{ id: string; name: string }[]>(
    cookie,
    "GET",
    `/vehicle-reference/makes/${make?.id}/models`,
  );
  const model = models.data.find((m) => m.name === v.model);
  const gens = await apiCall<{ id: string; name: string }[]>(
    cookie,
    "GET",
    `/vehicle-reference/models/${model?.id}/generations`,
  );
  const created = await apiCall<{ id: string }>(cookie, "POST", "/me/vehicles", {
    vehicleType: v.type,
    makeId: make?.id,
    modelId: model?.id,
    generationId: gens.data.find((g) => g.name === v.generation)?.id ?? null,
    year: v.year,
    plate: randomPlate(),
  });
  expect(created.status, JSON.stringify(created.data)).toBe(201);
  const form = new FormData();
  form.set("photo", new Blob([new Uint8Array(samplePhoto([60, 70, 90]))], { type: "image/png" }), "photo.png");
  form.set("noPlate", "true");
  const res = await fetch(`${API}/api/me/vehicles/${created.data.id}/photos`, {
    method: "POST",
    headers: { origin: WEB, cookie },
    body: form,
  });
  expect(res.status).toBe(201);
  return created.data.id;
}

async function garage(pseudo: string) {
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo, email);
  const car = await vehicle(cookie, { type: "car", make: "Peugeot", model: "206", year: 2003 });
  const moto = await vehicle(cookie, { type: "moto", make: "Yamaha", model: "MT-07", generation: "Gen 1", year: 2019 });
  const truck = await vehicle(cookie, { type: "truck", make: "Scania", model: "Série R", year: 2008 });
  return { email, cookie, car, moto, truck };
}

// --- Appli ------------------------------------------------------------------------------------------------------------

async function openApp(browser: Browser, theme: Theme, width: number) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, baseURL: APP });
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
  await page.waitForURL(/accueil|explorer|sorties/, { timeout: 30_000 });
}

/** Modification d'un véhicule par les étapes, jusqu'à l'étape `n` (1 à 5). */
async function toStep(page: Page, id: string, n: number) {
  await page.goto(`/vehicule/${id}/modifier`);
  await afterOpening(page);
  for (let i = 1; i < n; i++) {
    await seeStepEnd(page);
    await page.getByTestId("vehicle-step-next").click();
  }
}

for (const theme of ["beton", "sable"] as const) {
  for (const width of [390, 384]) {
    test(`appli (${theme}, ${width} px) : Marque et modèle, Catégories, admin, voisins`, async ({ browser }) => {
      test.skip(!APP, "Appli : lancer avec APP_URL");
      test.setTimeout(300_000);
      const dir = `${ROOT}/appli`;
      const name = (n: string) => `${theme}-${width}-${n}`;
      const g = await garage(`R5aC${unique()}`.slice(0, 20));
      const { ctx, page } = await openApp(browser, theme, width);
      await page.goto("/auth");
      await afterOpening(page);
      await shot(page, dir, name("08-voisin-connexion"));
      await signIn(page, g.email);

      // Voisin : la première étape de l'ajout (en-tête de parcours, pied, indicateur du bas).
      await page.goto("/vehicule/nouveau");
      await afterOpening(page);
      await expect(page.getByText("Étape 1 sur 5", { exact: false })).toBeVisible({ timeout: 30_000 });
      await shot(page, dir, name("07-voisin-ajout-photos"));

      // Marque et modèle : la moto, marque retirée → la liste des marques.
      await toStep(page, g.moto, 3);
      await expect(page.getByText("Étape 3 sur 5 · Marque et modèle")).toBeVisible();
      await page.getByRole("button", { name: /^Marque : Yamaha, changer$/ }).click();
      await expect(page.getByTestId("ref-row").first()).toBeVisible({ timeout: 30_000 });
      await shot(page, dir, name("01-marque-liste-moto"));
      await page.getByTestId("vehicle-search").fill("mt");
      await expect(page.getByTestId("ref-row").filter({ hasText: "MT-07" }).first()).toBeVisible({ timeout: 30_000 });
      await shot(page, dir, name("02-marque-recherche"));

      // Catégories : voiture, moto, camion.
      for (const [id, label] of [
        [g.car, "03-categories-voiture"],
        [g.moto, "04-categories-moto"],
        [g.truck, "05-categories-camion"],
      ] as const) {
        await toStep(page, id, 5);
        await expect(page.getByText("Étape 5 sur 5 · Catégories")).toBeVisible();
        await expect(page.getByTestId("vehicle-step-title")).toBeVisible();
        await page.waitForTimeout(800);
        await shot(page, dir, name(label));
        await page.getByTestId("vehicle-style").first().scrollIntoViewIfNeeded();
        await page.mouse.wheel(0, 2000);
        await shot(page, dir, name(`${label}-bas`));
      }
      await ctx.close();
    });

    test(`appli (${theme}, ${width} px) : « Modifier la fiche » (feuille du menu …)`, async ({ browser }) => {
      test.skip(!APP, "Appli : lancer avec APP_URL");
      test.setTimeout(180_000);
      const dir = `${ROOT}/appli`;
      const g = await garage(`R5aF${unique()}`.slice(0, 20));
      const { ctx, page } = await openApp(browser, theme, width);
      await signIn(page, g.email);
      for (const [id, label] of [
        [g.moto, "09-feuille-modifier-moto"],
        [g.truck, "10-feuille-modifier-camion"],
      ] as const) {
        await page.goto(`/vehicule/${id}`);
        await afterOpening(page);
        await page.getByTestId("vehicle-menu").click();
        await page.getByTestId("vehicle-edit-open").click();
        await expect(page.getByTestId("vehicle-save")).toBeVisible({ timeout: 30_000 });
        await page.getByTestId("vehicle-save").scrollIntoViewIfNeeded();
        await page.waitForTimeout(600);
        await shot(page, dir, `${theme}-${width}-${label}`);
      }
      await ctx.close();
    });

    test(`appli (${theme}, ${width} px) : base véhicules de l'administration`, async ({ browser }) => {
      test.skip(!APP, "Appli : lancer avec APP_URL");
      test.setTimeout(180_000);
      const dir = `${ROOT}/appli`;
      const admin = await openApp(browser, theme, width);
      await signIn(admin.page, "damien@orasso.local");
      // La casquette Administration, puis la page (comme `appli-administration.spec.ts`).
      await admin.page.goto("/moi");
      await admin.page.getByTestId("casquette-admin").click();
      await admin.page.waitForURL(/administration/, { timeout: 20_000 });
      await admin.page.goto("/vehicules");
      await admin.page.waitForTimeout(3500);
      await expect(admin.page.getByTestId("make-form")).toBeAttached({ timeout: 30_000 });
      await shot(admin.page, dir, `${theme}-${width}-06-admin-vehicules`);
      await admin.ctx.close();
    });
  }
}

// --- Site -------------------------------------------------------------------------------------------------------------

for (const theme of ["beton", "sable"] as const) {
  for (const width of [390, 1280]) {
    test(`site (${theme}, ${width} px) : ajout, modification, admin`, async ({ browser }) => {
      test.setTimeout(240_000);
      const dir = `${ROOT}/site`;
      const name = (n: string) => `${theme}-${width}-${n}`;
      const g = await garage(`R5aS${unique()}`.slice(0, 20));
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, g.email, undefined, "/app/garage/nouveau");
      const identity = page.getByTestId("add-identity");
      await identity.locator('input[name="vehicleType"][value="moto"]').check();
      await identity.scrollIntoViewIfNeeded();
      await shot(page, dir, name("01-ajout-marque-moto"));
      await page.getByLabel("Marque", { exact: true }).selectOption({ label: "Yamaha" });
      await expect(page.getByLabel("Modèle", { exact: true }).locator("option", { hasText: "MT-07" })).toHaveCount(1);
      await page.getByLabel("Modèle", { exact: true }).selectOption({ label: "MT-07" });
      await page.getByLabel("Année").fill("2019");
      const categories = page.getByTestId("add-categories");
      await categories.scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await shot(page, dir, name("02-ajout-categories-moto"));

      await page.goto(`/app/garage/${g.truck}`);
      await page.getByText("Modifier la fiche", { exact: true }).click();
      await page.getByTestId("vehicle-edit").locator("fieldset").last().scrollIntoViewIfNeeded();
      await shot(page, dir, name("03-modifier-categories-camion"));
      await ctx.close();

      const admin = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const pageA = await admin.newPage();
      await setTheme(pageA, theme);
      await loginInBrowser(pageA, "damien@orasso.local", undefined, "/admin/vehicules");
      await pageA.goto("/admin/vehicules");
      await expect(pageA.getByTestId("make-form")).toBeVisible({ timeout: 30_000 });
      await shot(pageA, dir, name("04-admin-vehicules"));
      await admin.close();
    });
  }
}
