import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  apiCall,
  type Cookie,
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

// Lot R4e : paires de captures avant / après, à lancer sur la branche telle que reçue (`CAPTURES_DIR`
// = …/lot-r4e-captures/avant) puis après le lot (…/apres). Une Volkswagen Golf avec la version « GTI » (ignorée avant
// le lot : la clé n'existait pas) : page du véhicule et sa fiche, étape « Fiche technique » de la modification (appli),
// page du garage et « Modifier la fiche » (site, 390 et 1 280 px), vitrine publique. Béton et Sable. Seulement des
// captures : les règles se vérifient dans `appli-lotr4e` et `lotr4e-site`.
const APP = process.env.APP_URL;
const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r4e-captures/apres`;
test.use({ actionTimeout: 30_000 });

async function shot(page: Page, name: string, full = false) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: full });
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

/** Volkswagen Golf (génération IV si elle existe), version « GTI », une photo sans plaque visible. */
async function golf(cookie: Cookie): Promise<string> {
  const makes = await apiCall<{ id: string; name: string }[]>(cookie, "GET", "/vehicle-reference/makes");
  const vw = makes.data.find((m) => m.name === "Volkswagen");
  const models = await apiCall<{ id: string; name: string }[]>(
    cookie,
    "GET",
    `/vehicle-reference/makes/${vw?.id}/models`,
  );
  const model = models.data.find((m) => m.name === "Golf");
  const gens = await apiCall<{ id: string; name: string; isOther: boolean }[]>(
    cookie,
    "GET",
    `/vehicle-reference/models/${model?.id}/generations`,
  );
  const gen = gens.data.find((g) => /\bIV\b|Mk ?4/i.test(g.name)) ?? null;
  const created = await apiCall<{ id: string }>(cookie, "POST", "/me/vehicles", {
    vehicleType: "car",
    makeId: vw?.id,
    modelId: model?.id,
    generationId: gen?.id ?? null,
    year: 2002,
    engine: "1.8 T 20V",
    powerHp: 180,
    plate: randomPlate(),
    version: "GTI",
  });
  expect(created.status).toBe(201);
  const form = new FormData();
  form.set("photo", new Blob([new Uint8Array(samplePhoto([60, 70, 90]))], { type: "image/png" }), "golf.png");
  form.set("noPlate", "true");
  const res = await fetch(`${API}/api/me/vehicles/${created.data.id}/photos`, {
    method: "POST",
    headers: { origin: WEB, cookie },
    body: form,
  });
  expect(res.status).toBe(201);
  return created.data.id;
}

test("R4e : captures avant / après (fiche technique, fiche avec version)", async ({ browser }) => {
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  const pseudo = `Avr4e${unique()}`.slice(0, 20);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo, email);
  const id = await golf(cookie);

  if (APP) {
    for (const theme of ["beton", "sable"]) {
      const page = await appPage(browser, theme);
      await page.goto("/auth");
      await skipOpening(page);
      await page.getByLabel("E-mail").fill(email);
      await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
      await page.getByRole("button", { name: "Me connecter" }).click();
      await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 30_000 });
      await page.goto(`/vehicule/${id}`);
      await skipOpening(page);
      await expect(page.getByTestId("vehicle-page")).toBeVisible({ timeout: 30_000 });
      await shot(page, `appli-vehicule-haut-${theme}`);
      await page.getByText("Fiche", { exact: true }).scrollIntoViewIfNeeded();
      await shot(page, `appli-vehicule-fiche-${theme}`);
      await page.goto(`/vehicule/${id}/modifier`);
      await skipOpening(page);
      for (let i = 0; i < 3; i++) {
        await seeStepEnd(page);
        await page.getByTestId("vehicle-step-next").click();
        await page.waitForTimeout(600);
      }
      await expect(page.getByText(/Étape 4 sur 5/)).toBeVisible();
      await shot(page, `appli-fiche-technique-${theme}`);
      await page.goto(`/v/${id}`);
      await skipOpening(page);
      await page.waitForTimeout(1500);
      await shot(page, `appli-vitrine-${theme}`);
      await page.context().close();
    }
  }

  for (const theme of ["beton", "sable"] as const) {
    for (const width of [390, 1280]) {
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, email, undefined, `/app/garage/${id}`);
      await page.goto(`/app/garage/${id}`);
      await shot(page, `site-vehicule-haut-${width}-${theme}`);
      await page
        .getByRole("heading", { name: "Fiche technique" })
        .scrollIntoViewIfNeeded()
        .catch(() => undefined);
      await shot(page, `site-vehicule-fiche-${width}-${theme}`);
      await page.getByText("Modifier la fiche").click();
      await page.getByTestId("vehicle-edit").scrollIntoViewIfNeeded();
      await shot(page, `site-modifier-fiche-${width}-${theme}`);
      await page.goto("/app/garage/nouveau");
      await page.getByTestId("add-engine-fields").scrollIntoViewIfNeeded();
      await shot(page, `site-ajout-fiche-technique-${width}-${theme}`);
      await page.goto(`/v/${id}`);
      await shot(page, `site-vitrine-${width}-${theme}`);
      await ctx.close();
    }
  }
});
