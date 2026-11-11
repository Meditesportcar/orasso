import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser } from "./helpers";
import { RELAIS } from "./relais";

// Lot R8q, côté site : « Pratique » — le bloc de l'Accueil (autour de ma ville, position donnée puis refusée, près de ma sortie, rien à
// moins de 30 km), « Voir tout » : liste, filtres, carte, lieu touché, « Y aller » (Google Maps, Waze), à 390 et 1280 px. La position
// n'est ni dans une adresse, ni dans le stockage du navigateur, ni envoyée aux sources (codes de département). L'API tourne sur les
// faux services locaux de `.run-r8q/stub.mjs` (météo, géocodeur, Overpass, prix des carburants), comme `appli-lotr8q.spec.ts`.
// Comptes : Pilote_103 (66, aucune sortie), Pilote_005 (66, une sortie).
test.use({ actionTimeout: 30_000 });
test.describe.configure({ mode: "serial" });

const NO_OUTING = "pilote103@orasso.local";
const WITH_OUTING = "pilote5@orasso.local";
const STUB = `http://127.0.0.1:${process.env.METEO_STUB_PORT ?? 4748}`;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r8q-captures/apres`;
const SHOTS = Boolean(process.env.CAPTURES);
if (SHOTS) mkdirSync(DIR, { recursive: true });
const GEO = { latitude: 42.704937, longitude: 2.895412 };

const cookies: Record<string, string> = {};
test.beforeAll(async () => {
  for (const email of [NO_OUTING, WITH_OUTING]) {
    cookies[email] = await login(email);
    await apiCall(cookies[email] ?? null, "PUT", "/me/weather/places", { places: [] });
    await apiCall(cookies[email] ?? null, "PUT", "/me/home/widgets", {
      order: [],
      hidden: ["live", "agenda", "favorite_garage", "pending"],
    });
  }
  const up = await fetch(`${STUB}/__stub?down=0&slow=0`).catch(() => null);
  expect(up?.ok, "les faux services locaux doivent tourner (.run-r8q/stub.mjs)").toBe(true);
});
test.afterAll(async () => {
  for (const email of [NO_OUTING, WITH_OUTING]) {
    await apiCall(cookies[email] ?? null, "PUT", "/me/weather/places", { places: [] });
    await apiCall(cookies[email] ?? null, "PUT", "/me/home/widgets", {
      order: [],
      hidden: ["agenda", "favorite_garage", "pending"],
    });
  }
});

async function openHome(
  browser: Browser,
  opts: { width?: number; theme?: string; geo?: boolean; email?: string } = {},
) {
  const { width = 390, theme = "beton", geo = false, email = NO_OUTING } = opts;
  const ctx = await browser.newContext({
    viewport: { width, height: width === 390 ? 844 : 900 },
    ...(geo ? { geolocation: GEO, permissions: ["geolocation"] } : {}),
  });
  // Le fond de carte (tuiles d'OpenFreeMap, d'OpenStreetMap) ne sort jamais en recette : les épingles sont du DOM.
  await ctx.route(/(openfreemap|openstreetmap)\.org/, (route) => route.abort());
  await ctx.addInitScript((t) => localStorage.setItem("orasso.theme", t), theme);
  const page = await ctx.newPage();
  await loginInBrowser(page, email, undefined, "/app");
  await page.goto("/app");
  await page.waitForLoadState("networkidle");
  return { ctx, page };
}

const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
};

/** Le bloc « Pratique » de l'Accueil, avec ses lignes. */
async function block(page: Page) {
  const b = page.getByTestId("widget-practical");
  await expect(b.getByTestId("practical-fuel")).toBeVisible({ timeout: 30_000 });
  await b.scrollIntoViewIfNeeded();
  return b;
}

for (const width of [390, 1280]) {
  test(`${width} px : par défaut (ma ville), les deux lignes, « Y aller », « Voir tout », pas de sélecteur sans sortie`, async ({
    browser,
  }) => {
    const { ctx, page } = await openHome(browser, { width, theme: width === 390 ? "beton" : "sable" });
    const b = await block(page);
    await expect(b).toContainText("Pratique");
    await expect(b.getByTestId("practical-hint")).toContainText("Autour de Perpignan, ta ville.");
    await expect(b.getByTestId("practical-fuel")).toContainText("Station-service la plus proche");
    await expect(b.getByTestId("practical-fuel")).toContainText(/ · \d+,\d\skm/);
    await expect(b.getByTestId("practical-wash")).toContainText("Lavage le plus proche");
    await expect(b.getByTestId("practical-use-position")).toContainText("Utiliser ma position");
    await expect(b.getByTestId("practical-choice")).toHaveCount(0);
    await expect(b.getByTestId("practical-see-all")).toContainText("Voir tout");
    // « Y aller » : Google Maps et Waze, par les coordonnées du lieu.
    await b.getByTestId("practical-fuel-go-go").click();
    const maps = b.getByTestId("practical-fuel-go").getByTestId("go-maps");
    await expect(maps).toBeVisible();
    await expect(maps).toHaveAttribute("href", /google\.com\/maps\/dir\/.*destination=42\./);
    await expect(b.getByTestId("practical-fuel-go").getByTestId("go-waze")).toHaveAttribute(
      "href",
      /waze\.com\/ul\?ll=42\.\d+,\d\.\d+&navigate=yes/,
    );
    await shot(page, `site-par-defaut-${width}`);
    await ctx.close();
  });
}

test("Personnaliser : « Pratique » et son aide", async ({ browser }) => {
  const { ctx, page } = await openHome(browser);
  await page.goto("/app/accueil/personnaliser");
  await expect(page.getByText("Station-service et lavage les plus proches")).toBeVisible();
  await shot(page, "site-personnaliser-390");
  await ctx.close();
});

test("position accordée : jamais dans une adresse ni dans le stockage, les sources ne voient que des départements", async ({
  browser,
}) => {
  await fetch(`${STUB}/__stub?reset=1`);
  const { ctx, page } = await openHome(browser, { geo: true });
  const requests: { url: string; body: string | null }[] = [];
  page.on("request", (r) => requests.push({ url: r.url(), body: r.postData() }));
  const b = await block(page);
  await b.getByTestId("practical-use-position").click();
  await expect(b.getByTestId("practical-use-position")).toContainText("Me relocaliser", { timeout: 20_000 });
  await expect(b.getByTestId("practical-hint")).toHaveCount(0);
  await expect(b.getByTestId("practical-fuel")).toContainText(/ · \d+,\d\skm/);
  const at = requests.find((r) => r.url.includes("/api/practical") && JSON.parse(r.body ?? "{}").near === "position");
  expect(at, "la requête de position part en POST").toBeTruthy();
  expect(JSON.parse(at?.body ?? "{}")).toEqual({ near: "position", lat: 42.7, lng: 2.9 });
  expect(at?.url).not.toMatch(/42\.7|2\.9|lat|lng/);
  for (const r of requests) {
    for (const needle of ["42.704937", "2.895412", "42.70494", "2.89541"]) {
      expect(r.url, r.url).not.toContain(needle);
      expect(r.body ?? "", r.url).not.toContain(needle);
    }
  }
  const seen = (await (await fetch(`${STUB}/__stub`)).json()) as { received: { department: string; url: string }[] };
  for (const c of seen.received) {
    expect(c.department).toMatch(/^[0-9][0-9AB]$/);
    expect(c.url).not.toMatch(/42\.7|2\.89|around|latitude|longitude/);
  }
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(stored).not.toMatch(/42\.704937|2\.895412|42\.70494|2\.89541/);
  await expect(page.getByTestId("widget-weather")).toContainText("ma position", { timeout: 20_000 });
  await shot(page, "site-position-390");
  await ctx.close();
});

test("position refusée : la ville, sans message d'erreur", async ({ browser }) => {
  const { ctx, page } = await openHome(browser);
  const b = await block(page);
  await b.getByTestId("practical-use-position").click();
  await page.waitForTimeout(2500);
  await expect(b.getByTestId("practical-hint")).toContainText("Autour de Perpignan, ta ville.");
  await expect(b).not.toContainText(/erreur|refus|impossible/i);
  await expect(b.getByTestId("practical-use-position")).toBeVisible();
  await ctx.close();
});

test("près de ma sortie : le sélecteur, la ligne « Autour de … », « Voir tout » garde le choix", async ({
  browser,
}) => {
  const { ctx, page } = await openHome(browser, { email: WITH_OUTING });
  const b = await block(page);
  await expect(b.getByTestId("practical-choice-me")).toContainText("Près de moi");
  await expect(b.getByTestId("practical-choice-outing")).toContainText("Près de ma sortie");
  await b.getByTestId("practical-choice-outing").click();
  await expect(b.getByTestId("practical-hint")).toContainText(/Autour de .+, l'événement où tu vas\./);
  await expect(b.getByTestId("practical-use-position")).toHaveCount(0);
  await shot(page, "site-sortie-390");
  await b.getByTestId("practical-see-all").click();
  await page.waitForURL(/\/app\/pratique\?ou=sortie/);
  await expect(page.getByTestId("practical-hint")).toContainText(/l'événement où tu vas\./);
  await ctx.close();
});

test("rien à moins de 30 km : une ville sans lieu proche", async ({ browser }) => {
  const cookie = cookies[NO_OUTING] ?? null;
  await apiCall(cookie, "PUT", "/me/weather/places", { places: [{ label: "Toulouse", lat: 43.6, lng: 1.44 }] });
  const { ctx, page } = await openHome(browser);
  const b = page.getByTestId("widget-practical");
  await expect(b.getByTestId("practical-empty")).toContainText("Rien à moins de 30 km.", { timeout: 30_000 });
  await expect(b.getByTestId("practical-hint")).toContainText("Autour de Toulouse, ta ville.");
  await shot(page, "site-rien-390");
  await apiCall(cookie, "PUT", "/me/weather/places", { places: [] });
  await ctx.close();
});

for (const width of [390, 1280]) {
  test(`${width} px : « Voir tout » : liste, filtres, carte, lieu touché, « Y aller » principal`, async ({
    browser,
  }) => {
    const { ctx, page } = await openHome(browser, {
      width,
      email: WITH_OUTING,
      theme: width === 390 ? "sable" : "beton",
    });
    const b = await block(page);
    await b.getByTestId("practical-see-all").click();
    await page.waitForURL(/\/app\/pratique/);
    await expect(page.getByText("Stations-service et lavage")).toBeVisible();
    const list = page.getByTestId("practical-list");
    await expect(list).toBeVisible();
    const rows = list.getByTestId(/practical-row-\d+$/);
    const all = await rows.count();
    expect(all).toBeGreaterThan(2);
    const kms = (await rows.allInnerTexts()).map((t) =>
      Number((/(\d+(?:,\d)?)\skm/.exec(t) ?? [])[1]?.replace(",", ".")),
    );
    expect(kms).toEqual([...kms].sort((a, c) => a - c));
    await shot(page, `site-liste-${width}`);
    // Filtres.
    await page.getByTestId("practical-filter-fuel").click();
    await expect(list.getByText("Lavage ·", { exact: false })).toHaveCount(0);
    await expect(list).toContainText("Station-service ·");
    await shot(page, `site-filtre-stations-${width}`);
    await page.getByTestId("practical-filter-wash").click();
    await expect(list.getByText("Station-service ·", { exact: false })).toHaveCount(0);
    await expect(list).toContainText("Lavage ·");
    await page.getByTestId("practical-filter-all").click();
    // La carte : une épingle par lieu, le plus proche déjà choisi, « Y aller » principal.
    await page.getByTestId("map-toggle").click();
    await expect(page.getByTestId("practical-map-view")).toBeVisible();
    const pins = page.locator('[data-testid^="practical-pin-"]');
    await expect(pins.first()).toBeVisible({ timeout: 30_000 });
    expect(await pins.count()).toBe(all);
    await expect(page.getByTestId("practical-selected")).toContainText(/ · \d+,\d\skm/);
    await shot(page, `site-carte-${width}`);
    const before = await page.getByTestId("practical-selected").innerText();
    await pins.nth(2).dispatchEvent("click");
    await expect(page.getByTestId("practical-selected")).not.toHaveText(before);
    await page.getByTestId("practical-selected-go-go").click();
    await expect(page.getByTestId("practical-selected").getByTestId("go-maps")).toBeVisible();
    await shot(page, `site-carte-y-aller-${width}`);
    // Retour à la liste.
    await page.getByTestId("list-toggle").click();
    await expect(page.getByTestId("practical-list")).toBeVisible();
    // Pas de défilement horizontal.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await ctx.close();
  });
}

test("tour 2 : deux positions dans la même séance, « Me relocaliser »", async ({ browser }) => {
  const { ctx, page } = await openHome(browser, { geo: true });
  const posted: { lat: number; lng: number }[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/practical") && r.method() === "POST") {
      const body = JSON.parse(r.postData() ?? "{}");
      if (body.near === "position") posted.push({ lat: body.lat, lng: body.lng });
    }
  });
  const b = await block(page);
  await b.getByTestId("practical-use-position").click();
  await expect(b.getByTestId("practical-use-position")).toContainText("Me relocaliser", { timeout: 20_000 });
  await ctx.setGeolocation({ latitude: 42.552, longitude: 3.031 });
  await b.getByTestId("practical-use-position").click();
  await expect.poll(() => posted.at(-1)?.lat, { timeout: 20_000 }).toBe(42.6);
  expect(posted.at(0)).toEqual({ lat: 42.7, lng: 2.9 });
  await ctx.close();
});

test("tour 2 : A lance une lecture, B se connecte : rien de A n'apparaît sous B", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  // La réponse du compte A est retardée de quelques secondes.
  await ctx.route(/\/api\/practical/, async (route) => {
    await new Promise((r) => setTimeout(r, 4000));
    await route.continue();
  });
  await loginInBrowser(page, WITH_OUTING, undefined, "/app");
  await page.goto("/app");
  await ctx.clearCookies();
  await loginInBrowser(page, NO_OUTING, undefined, "/app");
  await page.goto("/app");
  await page.waitForLoadState("networkidle");
  const b = page.getByTestId("widget-practical");
  await expect(b.getByTestId("practical-fuel")).toBeVisible({ timeout: 40_000 });
  // Compte B : pas de sélecteur « Près de ma sortie » (la sortie de A ne lui appartient pas).
  await expect(b.getByTestId("practical-choice")).toHaveCount(0);
  await ctx.close();
});
