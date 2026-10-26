import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import pg from "pg";
import { auditPage } from "./audit";
import { apiCall, type Cookie, loginInBrowser, randomPlate, setTheme, signUpApi, unique } from "./helpers";
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
