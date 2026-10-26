import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import pg from "pg";
import { auditPage } from "./audit";
import {
  apiCall,
  type Cookie,
  createEvent,
  login,
  loginInBrowser,
  randomPlate,
  setTheme,
  signUpApi,
  unique,
} from "./helpers";
import { RELAIS } from "./relais";

// Lot R5a, côté site, d'après la maquette R5 validée par Damien le 26/10 (mêmes règles et mêmes mots que l'appli) :
//   - R5.1 : la liste des marques suit le type (pas de Seat dans les motos, Honda dans les deux) ; « Résultats » au-dessus
//     d'une recherche ;
//   - R5.2 : les styles du type, par famille, avec leur icône ; « Il manque un style ? Propose-le » à l'ajout et dans
//     « Modifier la fiche » ; un style en pause gardé sur la fiche ;
//   - R5.3 : l'onglet « Styles » de la base véhicules : types, familles, ordre (flèches), pause, file des propositions
//     (refuser, ajouter au catalogue).
// Béton et Sable, 390 et 1 280 px.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r5a-captures/apres/site-recette`;
test.use({ actionTimeout: 30_000 });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function moto(cookie: Cookie): Promise<string> {
  const makes = await apiCall<{ id: string; name: string }[]>(cookie, "GET", "/vehicle-reference/makes");
  const yamaha = makes.data.find((m) => m.name === "Yamaha");
  const models = await apiCall<{ id: string; name: string }[]>(
    cookie,
    "GET",
    `/vehicle-reference/makes/${yamaha?.id}/models`,
  );
  const created = await apiCall<{ id: string }>(cookie, "POST", "/me/vehicles", {
    vehicleType: "moto",
    makeId: yamaha?.id,
    modelId: models.data.find((m) => m.name === "MT-07")?.id,
    year: 2019,
    plate: randomPlate(),
  });
  expect(created.status).toBe(201);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    // Une fiche d'avant la pause de « Moto » (l'API ne pose plus un style en pause).
    await client.query(
      "insert into vehicle_categories (vehicle_id, category_id) select $1, id from categories where slug = 'moto' on conflict do nothing",
      [created.data.id],
    );
  } finally {
    await client.end();
  }
  return created.data.id;
}

for (const theme of ["beton", "sable"] as const) {
  for (const width of [390, 1280]) {
    test(`styles et marques par type, « Propose-le », onglet Styles de l'admin (${theme}, ${width} px)`, async ({
      browser,
    }) => {
      test.setTimeout(240_000);
      const pseudo = `R5aS${unique()}`.slice(0, 20);
      const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
      const cookie = await signUpApi(pseudo, email);
      const mt07 = await moto(cookie);
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, email, undefined, "/app/garage/nouveau");

      // --- R5.1 ------------------------------------------------------------------------------------------------------
      const identity = page.getByTestId("add-identity");
      const makeSelect = page.getByLabel("Marque", { exact: true });
      await identity.locator('input[name="vehicleType"][value="moto"]').check();
      await expect(makeSelect.locator("option", { hasText: /^Yamaha$/ })).toHaveCount(1);
      await expect(makeSelect.locator("option", { hasText: /^Honda$/ })).toHaveCount(1);
      await expect(makeSelect.locator("option", { hasText: /^Seat$/ })).toHaveCount(0);
      await expect(makeSelect.locator("option").first()).toHaveText(/Marques de motos · de A à Z, \d+/);
      await identity.locator('input[name="vehicleType"][value="car"]').check();
      await expect(makeSelect.locator("option", { hasText: /^Seat$/ })).toHaveCount(1);
      await expect(makeSelect.locator("option", { hasText: /^Honda$/ })).toHaveCount(1);
      await identity.locator('input[name="vehicleType"][value="moto"]').check();
      await identity.getByLabel("Marque ou modèle").fill("mt");
      await expect(identity.getByTestId("add-search-head")).toContainText("Résultats");
      await expect(identity.getByTestId("add-search-hits")).toContainText("Yamaha MT-07");
      await identity.scrollIntoViewIfNeeded();
      await shot(page, `${theme}-${width}-01-resultats-motos`);
      await identity
        .getByTestId("add-search-hits")
        .getByRole("button", { name: /Yamaha MT-07/ })
        .first()
        .click();
      await page.getByLabel("Année").fill("2019");

      // --- R5.2 ------------------------------------------------------------------------------------------------------
      const cats = page.getByTestId("categories");
      for (const family of ["epoque", "genre", "preparation", "pratique"]) {
        await expect(cats.getByTestId(`family-${family}`)).toBeVisible();
      }
      await expect(cats.getByRole("checkbox", { name: "Supermotard" })).toBeEnabled();
      await expect(cats.getByRole("checkbox", { name: "Drift" })).toHaveCount(0);
      await expect(cats.getByRole("checkbox", { name: "Youngtimer" })).toBeDisabled();
      await expect(page.getByTestId("add-styles-note")).toContainText("sont grisées : ta moto est de 2019.");
      const propose = page.getByTestId("style-propose");
      await propose.locator("summary").click();
      const styleName = `Rat ${unique().slice(-4)}`;
      await propose.getByLabel("Nom du style").fill(styleName);
      await propose.getByTestId("style-propose-send").click();
      await expect(propose.getByTestId("style-propose-done")).toHaveText(
        `Merci : « ${styleName} » est proposé à l'équipe Orasso.`,
      );
      await expect(page.locator('input[name="styleProposalIds"]')).toHaveCount(1);
      await page.getByTestId("add-categories").scrollIntoViewIfNeeded();
      await shot(page, `${theme}-${width}-02-styles-moto-propose`);
      const audit = await auditPage(page);
      expect(audit.greens).toEqual([]);
      expect(audit.horizontalScroll).toBe(false);

      // « Modifier la fiche » : familles, style en pause gardé.
      await page.goto(`/app/garage/${mt07}`);
      await page.getByText("Modifier la fiche", { exact: true }).click();
      const edit = page.getByTestId("vehicle-edit-categories");
      await expect(edit.getByTestId("edit-family-genre")).toContainText("Moto · en pause");
      await expect(edit.getByRole("checkbox", { name: /Moto · en pause/ })).toBeChecked();
      await expect(edit.getByRole("checkbox", { name: /Drift/ })).toHaveCount(0);
      await edit.scrollIntoViewIfNeeded();
      await shot(page, `${theme}-${width}-03-modifier-la-fiche`);
      await page.getByLabel("Moteur").fill("689 cm³ CP2");
      await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
      await expect(page.getByText("Enregistré.")).toBeVisible();
      const saved = await apiCall<{ categories: { slug: string }[] }>(cookie, "GET", `/me/vehicles/${mt07}`);
      expect(saved.data.categories.map((c) => c.slug)).toContain("moto");
      await ctx.close();

      // --- R5.3 : l'onglet « Styles » de la base véhicules -----------------------------------------------------------
      const admin = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const pa = await admin.newPage();
      await setTheme(pa, theme);
      await loginInBrowser(pa, "damien@orasso.local", undefined, "/admin/vehicules");
      await pa.goto("/admin/vehicules");
      const tabs = pa.getByTestId("vehicle-base-tabs");
      await expect(tabs).toContainText("Marques et modèles");
      await tabs.getByRole("link", { name: /^Styles/ }).click();
      await pa.waitForURL(/\/admin\/vehicules\/styles/);
      await pa.getByTestId("styles-types").getByRole("link", { name: /^Moto/ }).click();
      await pa.waitForURL(/type=moto/);
      const genre = pa.getByTestId("styles-family-genre");
      await expect(genre).toContainText("Supermotard");
      await expect(genre).not.toContainText("Drift");
      await genre.scrollIntoViewIfNeeded();
      await shot(pa, `${theme}-${width}-04-admin-styles-moto`);
      // Ordre : « Trail » monte d'un cran dans sa famille.
      const names = async () => genre.locator(".adm-styles__name").allInnerTexts();
      const before = await names();
      const i = before.indexOf("Trail");
      expect(i).toBeGreaterThan(0);
      await genre.getByRole("button", { name: "Monter Trail" }).click();
      await expect(pa.getByTestId("styles-done")).toBeVisible();
      await expect.poll(names).toEqual([...before.slice(0, i - 1), "Trail", before[i - 1], ...before.slice(i + 1)]);
      // On le remet à sa place.
      await pa.getByTestId("styles-family-genre").getByRole("button", { name: "Descendre Trail" }).click();
      await expect.poll(names).toEqual(before);
      // La file : refuser la proposition de ce passage.
      const group = pa.getByTestId("style-proposal").filter({ hasText: styleName });
      await expect(group).toBeVisible();
      if (!(await group.evaluate((el) => (el as HTMLDetailsElement).open))) await group.locator("summary").click();
      await group.scrollIntoViewIfNeeded();
      await shot(pa, `${theme}-${width}-05-admin-proposition`);
      await group.getByTestId("style-proposal-decline").getByRole("button", { name: "Refuser" }).click();
      await expect(pa.getByTestId("styles-done")).toBeVisible();
      await expect(pa.getByTestId("style-proposal").filter({ hasText: styleName })).toHaveCount(0);
      const adminAudit = await auditPage(pa);
      expect(adminAudit.greens).toEqual([]);
      expect(adminAudit.horizontalScroll).toBe(false);
      await admin.close();
    });
  }
}

/** Une requête directe sur la base de dev (ce que l'API ne permet plus de poser : un style en pause, un ancien choix). */
async function sql(text: string, values: unknown[] = []) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return (await client.query(text, values)).rows;
  } finally {
    await client.end();
  }
}

// Tour 2 (relectures Opus et Codex) : ce qui est déjà choisi ne disparaît jamais d'un formulaire.
for (const theme of ["beton", "sable"] as const) {
  for (const width of [390, 1280]) {
    test(`tour 2 : 4x4 d'un camion gardé, centres d'intérêt et critères en pause gardés (${theme}, ${width} px)`, async ({
      browser,
    }) => {
      test.setTimeout(240_000);
      const pseudo = `R5aT${unique()}`.slice(0, 20);
      const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
      const cookie = await signUpApi(pseudo, email);
      const makes = await apiCall<{ id: string; name: string }[]>(cookie, "GET", "/vehicle-reference/makes");
      const scania = makes.data.find((m) => m.name === "Scania");
      const models = await apiCall<{ id: string; name: string }[]>(
        cookie,
        "GET",
        `/vehicle-reference/makes/${scania?.id}/models`,
      );
      const truck = await apiCall<{ id: string }>(cookie, "POST", "/me/vehicles", {
        vehicleType: "truck",
        makeId: scania?.id,
        modelId: models.data.find((m) => m.name === "Série R")?.id,
        year: 2008,
        plate: randomPlate(),
      });
      expect(truck.status).toBe(201);
      await sql(
        "insert into vehicle_categories (vehicle_id, category_id) select $1, id from categories where slug = '4x4'",
        [truck.data.id],
      );
      const [me] = await sql('select id from "user" where email = $1', [email]);
      await sql(
        "insert into profile_interests (user_id, category_id) select $1, id from categories where slug = 'moto'",
        [me.id],
      );
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, email, undefined, `/app/garage/${truck.data.id}`);
      const slugs = async () =>
        (
          await apiCall<{ categories: { slug: string }[] }>(cookie, "GET", `/me/vehicles/${truck.data.id}`)
        ).data.categories.map((c) => c.slug);

      // « 4x4 » (refusé pour un camion depuis le lot) : coché, avec sa raison ; changer le moteur, puis l'année, le garde.
      await page.getByText("Modifier la fiche", { exact: true }).click();
      const genre = page.getByTestId("edit-family-genre");
      await expect(genre.getByRole("checkbox", { name: /4x4/ })).toBeChecked();
      await expect(genre).toContainText("Ne convient pas à ce type de véhicule");
      await genre.scrollIntoViewIfNeeded();
      await shot(page, `${theme}-${width}-06-camion-4x4-garde`);
      await page.getByLabel("Moteur").fill("DC13 500 ch");
      await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
      await expect(page.getByText("Enregistré.")).toBeVisible();
      expect(await slugs()).toContain("4x4");
      await page.getByText("Modifier la fiche", { exact: true }).click();
      await page.getByLabel("Année").fill("2009");
      await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
      await expect(page.getByText("Enregistré.")).toBeVisible();
      expect(await slugs()).toContain("4x4");

      // Centres d'intérêt : par famille ; « Moto » en pause reste coché, et l'enregistrement ne le retire pas.
      await page.goto("/app/preferences");
      const prefGenre = page.getByTestId("pref-family-genre");
      await expect(prefGenre.getByRole("checkbox", { name: "Moto · en pause" })).toBeChecked();
      await expect(prefGenre).toContainText("Américain · camion");
      await expect(page.getByTestId("pref-family-pays")).toContainText("Américaine");
      await prefGenre.scrollIntoViewIfNeeded();
      await shot(page, `${theme}-${width}-07-centres-d-interet`);
      await page.getByTestId("preferences-submit").click();
      await expect(page.getByTestId("preferences-saved")).toBeVisible({ timeout: 30_000 });
      const prefs = await apiCall<{ interests: string[] }>(cookie, "GET", "/me/preferences");
      const [moto] = await sql("select id from categories where slug = 'moto'");
      expect(prefs.data.interests).toContain(moto.id);
      await ctx.close();

      // Critères d'un événement : par famille, avec le type ; « Moto » en pause, déjà choisi, reste affiché et choisi.
      const damien = await login("damien@orasso.local");
      const event = await createEvent(damien);
      await sql(
        "update events set criteria = jsonb_build_object('categoryIds', jsonb_build_array($2::text), 'makeIds', '[]'::jsonb, 'countries', '[]'::jsonb) where id = $1",
        [event.id, moto.id],
      );
      const orga = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const po = await orga.newPage();
      await setTheme(po, theme);
      await loginInBrowser(
        po,
        "damien@orasso.local",
        undefined,
        `/orga/meditesportcar/e/${event.id}/modifier?temps=criteres`,
      );
      await po.goto(`/orga/meditesportcar/e/${event.id}/modifier?temps=criteres`);
      const styles = po.getByTestId("wizard-styles");
      await expect(styles.getByTestId("wizard-family-genre")).toContainText("Moto · en pause");
      await expect(styles.getByTestId("wizard-family-genre")).toContainText("Américain · camion");
      await expect(styles).not.toContainText("Allemande");
      await styles.scrollIntoViewIfNeeded();
      await shot(po, `${theme}-${width}-08-criteres`);
      await orga.close();
    });
  }
}
