import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import pg from "pg";
import { auditPage } from "./audit";
import {
  apiCall,
  type Cookie,
  randomPlate,
  SEED_PASSWORD,
  samplePhoto,
  seeStepEnd,
  signUpApi,
  unique,
} from "./helpers";
import { RELAIS } from "./relais";

// Lot R5a, côté appli (version web compilée), d'après la maquette R5 validée par Damien le 26/10 :
//   - R5.1 : la liste des marques suit le type (« Marques de motos », pas de Seat ; Honda dans les deux) ; « Résultats »
//     au-dessus d'une recherche ; champ en saisie : carte « Ton véhicule », titre, « Continuer » et flèche du bas se
//     replient, tout revient au premier toucher dans la liste ;
//   - R5.2 : les styles du type, rangés par famille (Époque, Genre, Préparation, Pratique), masculin pour un camion, un
//     style en pause gardé sur la fiche ; « Il manque un style ? Propose-le » ;
//   - R5.3 : le catalogue des styles de la casquette Administration : onglets par type, familles, « Styles proposés »,
//     « Ajouter au catalogue » pose le style sur le véhicule du proposant.
// Béton et Sable, 390 px (le clavier natif se vérifie sur le téléphone).
const APP = process.env.APP_URL;
const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r5a-captures/apres/appli-recette`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

type Theme = "beton" | "sable";

async function open(browser: Browser, theme: Theme) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: APP });
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

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function vehicle(
  cookie: Cookie,
  v: { type: "car" | "moto" | "truck"; make: string; model: string; year: number },
): Promise<string> {
  const makes = await apiCall<{ id: string; name: string }[]>(cookie, "GET", "/vehicle-reference/makes");
  const make = makes.data.find((m) => m.name === v.make);
  const models = await apiCall<{ id: string; name: string }[]>(
    cookie,
    "GET",
    `/vehicle-reference/makes/${make?.id}/models`,
  );
  const model = models.data.find((m) => m.name === v.model);
  const created = await apiCall<{ id: string }>(cookie, "POST", "/me/vehicles", {
    vehicleType: v.type,
    makeId: make?.id,
    modelId: model?.id,
    year: v.year,
    plate: randomPlate(),
  });
  expect(created.status, JSON.stringify(created.data)).toBe(201);
  const form = new FormData();
  form.set("photo", new Blob([new Uint8Array(samplePhoto([70, 60, 90]))], { type: "image/png" }), "p.png");
  form.set("noPlate", "true");
  const res = await fetch(`${API}/api/me/vehicles/${created.data.id}/photos`, {
    method: "POST",
    headers: { origin: WEB, cookie },
    body: form,
  });
  expect(res.status).toBe(201);
  return created.data.id;
}

/** Pose un style déjà en pause sur un véhicule (comme une fiche d'avant la pause : l'API ne le permet plus). */
async function withPausedStyle(vehicleId: string, slug: string) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      "insert into vehicle_categories (vehicle_id, category_id) select $1, id from categories where slug = $2 on conflict do nothing",
      [vehicleId, slug],
    );
  } finally {
    await client.end();
  }
}

async function toStep(page: Page, id: string, n: number) {
  await page.goto(`/vehicule/${id}/modifier`);
  await afterOpening(page);
  for (let i = 1; i < n; i++) {
    await seeStepEnd(page);
    await page.getByTestId("vehicle-step-next").click();
  }
}

for (const theme of ["beton", "sable"] as const) {
  test(`marques par type, clavier, styles par famille, « Propose-le », admin des styles (${theme})`, async ({
    browser,
  }) => {
    test.setTimeout(420_000);
    const pseudo = `R5a${unique()}`.slice(0, 20);
    const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
    const cookie = await signUpApi(pseudo, email);
    const moto = await vehicle(cookie, { type: "moto", make: "Yamaha", model: "MT-07", year: 2019 });
    const truck = await vehicle(cookie, { type: "truck", make: "Scania", model: "Série R", year: 2008 });
    await withPausedStyle(moto, "moto");
    const { ctx, page } = await open(browser, theme);
    await signIn(page, email);

    // --- R5.1 : la liste des marques suit le type --------------------------------------------------------------------
    await toStep(page, moto, 3);
    await expect(page.getByText("Étape 3 sur 5 · Marque et modèle")).toBeVisible();
    await page.getByRole("button", { name: /^Marque : Yamaha, changer$/ }).click();
    const head = page.getByTestId("vehicle-list-head");
    await expect(head).toContainText("Marques de motos");
    await expect(head).toContainText(/de A à Z, \d+/);
    const rows = page.getByTestId("ref-row");
    await expect(rows.filter({ hasText: /^Yamaha$/ })).toHaveCount(1);
    await expect(rows.filter({ hasText: /^Honda$/ })).toHaveCount(1);
    await expect(rows.filter({ hasText: /^Seat$/ })).toHaveCount(0);
    await expect(page.getByText("Marque", { exact: true })).toHaveCount(0);
    await shot(page, `${theme}-01-marques-de-motos`);
    await page.getByTestId("vehicle-type-car").click();
    await expect(head).toContainText("Marques de voitures");
    await expect(rows.filter({ hasText: /^Seat$/ })).toHaveCount(1);
    await expect(rows.filter({ hasText: /^Honda$/ })).toHaveCount(1);
    await page.getByTestId("vehicle-type-moto").click();
    await expect(head).toContainText("Marques de motos");

    // Le champ en saisie : la carte, le titre, « Continuer » et la flèche se replient ; « Résultats ».
    const search = page.getByTestId("vehicle-search");
    await search.click();
    await search.fill("mt");
    await expect(head).toContainText("Résultats");
    await expect(head).toContainText(/\d+ motos?/);
    await expect(page.getByTestId("vehicle-step-title")).toHaveCount(0);
    await expect(page.getByTestId("vehicle-step-next")).toHaveCount(0);
    await expect(page.getByTestId("flow-end-hint")).toHaveCount(0);
    await expect(rows.filter({ hasText: "MT-07" }).first()).toBeVisible();
    await shot(page, `${theme}-02-clavier-resultats`);
    // Premier toucher dans la liste : la ligne est choisie, tout revient.
    await rows.filter({ hasText: "MT-07" }).first().click();
    await expect(page.getByTestId("vehicle-step-title")).toBeVisible();
    await expect(page.getByTestId("vehicle-step-next")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Modèle : MT-07, changer$/ })).toBeVisible();
    await shot(page, `${theme}-03-retour-apres-toucher`);
    const audit = await auditPage(page);
    expect(audit.greens).toEqual([]);
    expect(audit.horizontalScroll).toBe(false);

    // --- R5.2 : styles du type par famille, style en pause gardé, « Propose-le » -------------------------------------
    await toStep(page, moto, 5);
    await expect(page.getByText("Étape 5 sur 5 · Catégories")).toBeVisible();
    for (const family of ["epoque", "genre", "preparation", "pratique"]) {
      await expect(page.getByTestId(`vehicle-family-${family}`)).toBeVisible();
    }
    await expect(page.getByTestId("vehicle-family-genre")).toContainText("Supermotard");
    await expect(page.getByRole("checkbox", { name: /^Drift/ })).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: /^Supercar/ })).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "D'origine" })).toBeVisible();
    // « Moto » en pause : affiché et gardé sur la fiche.
    const paused = page.getByTestId("vehicle-style-paused");
    await expect(paused).toContainText("Moto · en pause");
    await expect(paused).toHaveAttribute("aria-checked", "true");
    await shot(page, `${theme}-04-styles-moto`);
    await page.getByTestId("style-propose").scrollIntoViewIfNeeded();
    await shot(page, `${theme}-05-styles-moto-bas`);
    const styleName = `Bobber ${unique().slice(-3)}`;
    await page.getByTestId("style-propose").click();
    await page.getByTestId("style-propose-name").fill(styleName);
    await expect(page.getByText("S'il est retenu, il est ajouté à ta Yamaha")).toBeVisible();
    await shot(page, `${theme}-06-proposer-un-style`);
    await page.getByTestId("style-propose-send").click();
    await expect(page.getByTestId("announce-info")).toContainText(`Merci : « ${styleName} » est proposé`);
    await shot(page, `${theme}-07-merci`);
    // La fiche s'enregistre avec son style en pause.
    await seeStepEnd(page);
    await page.getByTestId("vehicle-step-next").click();
    await expect
      .poll(
        async () =>
          (
            await apiCall<{ categories: { slug: string }[] }>(cookie, "GET", `/me/vehicles/${moto}`)
          ).data.categories.map((c) => c.slug),
        { timeout: 30_000 },
      )
      .toContain("moto");

    // Un camion : « Ancien », « Préparé », la phrase au masculin.
    await toStep(page, truck, 5);
    await expect(page.getByRole("checkbox", { name: /^Ancien,/ })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Préparé" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Show truck" })).toBeVisible();
    await expect(page.getByTestId("vehicle-styles-note")).toContainText("sont grisés : ton camion est de 2008.");
    await shot(page, `${theme}-08-styles-camion`);
    await ctx.close();

    // --- R5.3 : catalogue des styles dans la casquette Administration ------------------------------------------------
    const admin = await open(browser, theme);
    await signIn(admin.page, "damien@orasso.local");
    await admin.page.goto("/moi");
    await admin.page.getByTestId("casquette-admin").click();
    await admin.page.waitForURL(/administration/, { timeout: 20_000 });
    await admin.page.goto("/vehicules");
    await admin.page.waitForTimeout(3000);
    await admin.page.getByTestId("vehicle-styles-tab").click();
    await expect(admin.page.getByTestId("styles-types")).toBeVisible({ timeout: 30_000 });
    await admin.page.getByTestId("styles-type-moto").click();
    await expect(admin.page.getByTestId("styles-family-genre")).toContainText("Supermotard");
    await expect(admin.page.getByTestId("styles-family-genre")).not.toContainText("Drift");
    await shot(admin.page, `${theme}-09-admin-styles-moto`);
    const group = admin.page.getByTestId("style-proposal").filter({ hasText: styleName });
    await group.scrollIntoViewIfNeeded();
    await shot(admin.page, `${theme}-10-admin-propositions`);
    await group.getByTestId("style-proposal-accept").click();
    await expect(admin.page.getByTestId("style-form-label")).toHaveValue(styleName);
    await shot(admin.page, `${theme}-11-admin-ajouter-au-catalogue`);
    await admin.page.getByTestId("orga-confirm").click();
    await expect(admin.page.getByText("C'est fait. L'action est écrite au journal d'administration.")).toBeVisible({
      timeout: 30_000,
    });
    await expect(admin.page.getByTestId("style-proposal").filter({ hasText: styleName })).toHaveCount(0);
    await admin.ctx.close();
    // Posé sur la moto du proposant (les règles l'acceptent) ; il est prévenu dans sa Boîte.
    const mine = await apiCall<{ categories: { label: string }[] }>(cookie, "GET", `/me/vehicles/${moto}`);
    expect(mine.data.categories.map((c) => c.label)).toContain(styleName);
  });
}
