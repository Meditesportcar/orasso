import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import pg from "pg";
import { auditPage } from "./audit";
import {
  apiCall,
  type Cookie,
  MOBILE,
  randomPlate,
  SEED_PASSWORD,
  samplePhoto,
  seeStepEnd,
  signUpApi,
  unique,
} from "./helpers";
import { RELAIS } from "./relais";

// Lot R4e, côté appli (version web compilée), décisions de Damien du 24/10 :
//   - le champ « Version (facultatif) » de la fiche technique (modification par les étapes), la fiche en direct qui le
//     montre après le modèle, ce que l'API garde (« Volkswagen Golf Mk4 GTI »), la ligne « Version » de la page du
//     véhicule et de la vitrine publique, la recherche « golf gti » d'un autre membre ;
//   - le propriétaire voit ses photos sur sa propre vitrine (`/v/:id`, son profil).
// Béton et Sable, 390 px. Lancer avec APP_URL (appli compilée : `node scripts/appli-compilee.mjs`), API seedée.
const APP = process.env.APP_URL;
const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r4e-captures/apres/appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

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

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

/** Volkswagen Golf Mk4 sans version, une photo « aucune plaque visible ». */
async function golf(cookie: Cookie): Promise<string> {
  const makes = await apiCall<{ id: string; name: string }[]>(cookie, "GET", "/vehicle-reference/makes");
  const vw = makes.data.find((m) => m.name === "Volkswagen");
  const models = await apiCall<{ id: string; name: string }[]>(
    cookie,
    "GET",
    `/vehicle-reference/makes/${vw?.id}/models`,
  );
  const model = models.data.find((m) => m.name === "Golf");
  const gens = await apiCall<{ id: string; name: string }[]>(
    cookie,
    "GET",
    `/vehicle-reference/models/${model?.id}/generations`,
  );
  const created = await apiCall<{ id: string }>(cookie, "POST", "/me/vehicles", {
    vehicleType: "car",
    makeId: vw?.id,
    modelId: model?.id,
    generationId: gens.data.find((g) => g.name === "Mk4")?.id ?? null,
    year: 2002,
    plate: randomPlate(),
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

for (const theme of ["beton", "sable"] as const) {
  test(`version du véhicule (${theme}) : fiche technique, fiche, vitrine, recherche`, async ({ browser }) => {
    test.setTimeout(300_000);
    const pseudo = `R4e${unique()}`.slice(0, 20);
    const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
    const cookie = await signUpApi(pseudo, email);
    const id = await golf(cookie);
    const { ctx, page } = await open(browser, theme);
    await page.goto("/auth");
    await afterOpening(page);
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
    await page.getByRole("button", { name: "Me connecter" }).click();
    await page.waitForURL(/accueil|explorer|sorties/, { timeout: 30_000 });

    // --- Fiche technique : « Version (facultatif) », avant la motorisation -----------------------------------------
    await page.goto(`/vehicule/${id}/modifier`);
    await afterOpening(page);
    for (let i = 0; i < 3; i++) {
      await seeStepEnd(page);
      await page.getByTestId("vehicle-step-next").click();
    }
    await expect(page.getByText("Étape 4 sur 5 · Fiche technique")).toBeVisible();
    const field = page.getByTestId("vehicle-version");
    await expect(page.getByText("Version (facultatif)")).toBeVisible();
    await expect(page.getByText("Par exemple CC, SW, GTI, Phase 2")).toBeVisible();
    await field.fill("GTI");
    // La fiche qui se construit : la version après le modèle.
    await expect(page.getByText("Volkswagen Golf GTI", { exact: true }).first()).toBeVisible();
    await field.scrollIntoViewIfNeeded();
    await shot(page, `${theme}-01-fiche-technique-version`);
    // Pas de vert ici : le nuancier de l'étape montre de vraies teintes de carrosserie (verts compris), on ne vérifie
    // que le défilement ; le vert se vérifie sur la page du véhicule.
    expect((await auditPage(page)).horizontalScroll).toBe(false);
    await seeStepEnd(page);
    await page.getByTestId("vehicle-step-next").click();
    await seeStepEnd(page);
    await page.getByTestId("vehicle-step-next").click();
    await expect
      .poll(async () => (await apiCall<{ version: string | null }>(cookie, "GET", `/me/vehicles/${id}`)).data.version, {
        timeout: 30_000,
      })
      .toBe("GTI");
    const saved = await apiCall<{ label: string }>(cookie, "GET", `/me/vehicles/${id}`);
    expect(saved.data.label).toBe("Volkswagen Golf Mk4 GTI");

    // --- Page du véhicule : le nom entier, la ligne « Version » ------------------------------------------------------
    await page.goto(`/vehicule/${id}`);
    await afterOpening(page);
    await expect(page.getByRole("heading", { name: "Volkswagen Golf Mk4 GTI" })).toBeVisible({ timeout: 30_000 });
    await shot(page, `${theme}-02-vehicule-nom`);
    const version = page.getByText("Version", { exact: true });
    await version.scrollIntoViewIfNeeded();
    await expect(version).toBeVisible();
    await expect(page.getByText("GTI", { exact: true })).toBeVisible();
    await shot(page, `${theme}-03-vehicule-fiche-version`);
    // Le nom ne se coupe pas : le titre tient dans l'écran, sans défilement horizontal ; pas de vert.
    const audit = await auditPage(page);
    expect(audit.greens).toEqual([]);
    expect(audit.horizontalScroll).toBe(false);

    // --- Vitrine publique vue par le propriétaire : la ligne « Version », sa photo SANS décision de plaque -----------
    // Photo ramenée à « sans décision » (ni floutée, ni « aucune plaque visible ») : les autres ne la voient pas, lui oui.
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        "update vehicle_photos set plate_blurred = false, no_plate_confirmed = false where vehicle_id = $1",
        [id],
      );
    } finally {
      await client.end();
    }
    await page.goto(`/v/${id}`);
    await afterOpening(page);
    await expect(page.getByTestId("vehicule")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Version", { exact: true })).toBeVisible();
    await shot(page, `${theme}-04-vitrine-proprietaire-photo-sans-decision`);
    const mine = await apiCall<{ photos: unknown[]; version: string }>(cookie, "GET", `/vehicles/${id}`);
    expect(mine.data).toMatchObject({ version: "GTI" });
    expect(mine.data.photos).toHaveLength(1);
    const ownProfile = await apiCall<{ vehicles: { photoUrl: string | null }[] }>(cookie, "GET", `/users/${pseudo}`);
    expect(ownProfile.data.vehicles[0]?.photoUrl).toBeTruthy();
    const stranger = await signUpApi(`R4eC${unique()}`.slice(0, 20));
    expect((await apiCall<{ photos: unknown[] }>(stranger, "GET", `/vehicles/${id}`)).data.photos).toEqual([]);
    const seen = await apiCall<{ vehicles: { photoUrl: string | null }[] }>(stranger, "GET", `/users/${pseudo}`);
    expect(seen.data.vehicles[0]?.photoUrl ?? null).toBeNull();

    // --- Version de 30 caractères sans espace : le nom ne se coupe jamais (fiche, garage, fiche qui se construit) -----
    const LONG = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123";
    expect((await apiCall(cookie, "PATCH", `/me/vehicles/${id}`, { version: LONG })).status).toBe(200);
    await page.goto(`/vehicule/${id}`);
    await afterOpening(page);
    const title = page.getByRole("heading", { name: `Volkswagen Golf Mk4 ${LONG}` });
    await expect(title).toBeVisible({ timeout: 30_000 });
    expect(await title.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect((await auditPage(page)).horizontalScroll).toBe(false);
    await shot(page, `${theme}-05-version-longue-fiche`);
    await page.goto("/garage");
    await afterOpening(page);
    const card = page.getByText(new RegExp(LONG)).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect((await auditPage(page)).horizontalScroll).toBe(false);
    await shot(page, `${theme}-06-version-longue-garage`);
    await page.goto(`/vehicule/${id}/modifier`);
    await afterOpening(page);
    for (let i = 0; i < 3; i++) {
      await seeStepEnd(page);
      await page.getByTestId("vehicle-step-next").click();
    }
    const live = page.getByText(`Volkswagen Golf ${LONG}`).first();
    await expect(live).toBeVisible();
    expect(await live.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, `${theme}-07-version-longue-fiche-en-direct`);
    // --- Recherche d'un autre membre : le modèle et la version ------------------------------------------------------
    const other = await signUpApi(`R4eB${unique()}`.slice(0, 20));
    const found = await apiCall<{ vehicles: { id: string; label: string }[] }>(
      other,
      "GET",
      "/search?q=golf%20abcdefghij",
    );
    expect(found.data.vehicles.map((v) => v.id)).toContain(id);
    await ctx.close();
  });
}
