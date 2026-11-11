import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD } from "./helpers";
import { RELAIS } from "./relais";

// Lot R8q, côté appli (version web compilée de recette) : « Pratique » — le bloc de l'Accueil (autour de ma ville, position donnée puis
// refusée, près de ma sortie, rien à moins de 30 km), « Voir tout » : liste, filtres, carte, lieu touché, « Y aller » (Maps, Waze),
// police ×1,3, hors ligne. La position n'est ni dans une adresse, ni dans le stockage, ni envoyée aux sources (codes de département).
// Lancer avec APP_URL, l'API sur les faux services locaux (`OVERPASS_URL`, `FUEL_API_URL`, `GEOCODER_URL` et `METEO_URL` sur le port de
// `METEO_STUB_PORT`) : le stub du lot est `.run-r8q/stub.mjs`. Comptes : Pilote_103 (66, aucune sortie), Pilote_005 (66, une sortie).
const APP = process.env.APP_URL;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });
test.describe.configure({ mode: "serial" });

const NO_OUTING = "pilote103@orasso.local";
const WITH_OUTING = "pilote5@orasso.local";
const STUB = `http://127.0.0.1:${process.env.METEO_STUB_PORT ?? 4748}`;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r8q-captures/apres`;
const SHOTS = Boolean(process.env.CAPTURES);
if (SHOTS) mkdirSync(DIR, { recursive: true });
// La position de l'appareil, volontairement précise : seule la case de 0,1° doit en sortir.
const GEO = { latitude: 42.704937, longitude: 2.895412 };

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

type Stub = { received: { source: string; department: string; url: string; body: string }[] };
const stub = async (): Promise<Stub> => (await fetch(`${STUB}/__stub`)).json() as Promise<Stub>;

async function open(
  browser: Browser,
  opts: { scale?: number; theme?: string; width?: number; geo?: boolean; email?: string; offline?: boolean } = {},
) {
  const { scale = 1, theme = "beton", width = 384, geo = false, email = NO_OUTING, offline = false } = opts;
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    baseURL: APP,
    ...(geo ? { geolocation: GEO, permissions: ["geolocation"] } : {}),
  });
  // Le fond de carte (tuiles d'OpenFreeMap, d'OpenStreetMap) ne sort jamais en recette : les épingles sont du DOM.
  await ctx.route(/(openfreemap|openstreetmap)\.org/, (route) => route.abort());
  // Réseau absent pour « Pratique » au départ (tour 2) : la lecture échoue, puis reprend quand on la rétablit.
  if (offline) await ctx.route(/\/api\/practical/, (route) => route.abort());
  await ctx.addInitScript(
    ([t, s]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", String(t));
      if (Number(s) > 1) localStorage.setItem("orasso.recette.echellePolice", String(s));
    },
    [theme, scale],
  );
  const page = await ctx.newPage();
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
  await page
    .getByTestId("whatsnew-dismiss")
    .click({ timeout: 4_000 })
    .catch(() => undefined);
  return { ctx, page };
}

const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${DIR}/${name}.png` });
};

/** Le bloc « Pratique » de l'Accueil, avec ses lignes. */
async function blockReady(page: Page) {
  const block = page.getByTestId("home-practical");
  await expect(block.getByTestId("practical-fuel")).toBeVisible({ timeout: 30_000 });
  await block.scrollIntoViewIfNeeded().catch(() => undefined);
  return block;
}

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
  await fetch(`${STUB}/__stub?down=0&slow=0`).catch(() => null);
});

test("par défaut : autour de ma ville, les deux lignes, « Utiliser ma position », « Voir tout », pas de sélecteur sans sortie", async ({
  browser,
}) => {
  const { ctx, page } = await open(browser);
  const block = await blockReady(page);
  await expect(block).toContainText("Pratique");
  await expect(block.getByTestId("practical-hint")).toContainText("Autour de Perpignan, ta ville.");
  await expect(block.getByTestId("practical-fuel")).toContainText("Station-service la plus proche");
  await expect(block.getByTestId("practical-fuel")).toContainText(/ · \d+,\d\skm/);
  await expect(block.getByTestId("practical-wash")).toContainText("Lavage le plus proche");
  await expect(block.getByTestId("practical-fuel-go")).toContainText("Y aller");
  await expect(block.getByTestId("practical-use-position")).toContainText("Utiliser ma position");
  await expect(block.getByTestId("practical-choice")).toHaveCount(0);
  await expect(block.getByRole("link", { name: "Voir tout" })).toBeVisible();
  // Le titre d'une station est la rue de son adresse (le jeu public n'a pas de nom).
  await expect(block.getByTestId("practical-fuel")).toContainText(/Rue du Vernet|Avenue|Route|Rue/);
  await shot(page, "appli-par-defaut-beton-384");
  await ctx.close();
});

test("Personnaliser : « Pratique » et son aide", async ({ browser }) => {
  const { ctx, page } = await open(browser);
  await page.getByTestId("home-personalize").click();
  await expect(page.getByText("Station-service et lavage les plus proches")).toBeVisible();
  await expect(page.getByTestId("personalize-row-practical")).toContainText("Pratique");
  await shot(page, "appli-personnaliser-beton-384");
  await ctx.close();
});

test("« Y aller » : la feuille Maps / Waze", async ({ browser }) => {
  const { ctx, page } = await open(browser, { theme: "sable" });
  const block = await blockReady(page);
  await block.getByTestId("practical-fuel-go").click();
  await expect(page.getByTestId("go-maps")).toContainText("Maps");
  await expect(page.getByTestId("go-waze")).toContainText("Waze");
  await expect(page.getByTestId("go-title")).toContainText("Y aller");
  await shot(page, "appli-y-aller-sable-384");
  await ctx.close();
});

test("position accordée : jamais dans une adresse ni dans le stockage, les sources ne voient que des départements", async ({
  browser,
}) => {
  await fetch(`${STUB}/__stub?reset=1`);
  const { ctx, page } = await open(browser, { geo: true });
  const requests: { url: string; body: string | null }[] = [];
  page.on("request", (r) => requests.push({ url: r.url(), body: r.postData() }));
  const block = await blockReady(page);
  await block.getByTestId("practical-use-position").click();
  await expect(block.getByTestId("practical-use-position")).toContainText("Me relocaliser", { timeout: 20_000 });
  await expect(block.getByTestId("practical-hint")).toHaveCount(0);
  await expect(block.getByTestId("practical-fuel")).toContainText(/ · \d+,\d\skm/);
  const at = requests.find((r) => r.url.includes("/api/practical") && JSON.parse(r.body ?? "{}").near === "position");
  expect(at, "la requête de position part en POST").toBeTruthy();
  expect(JSON.parse(at?.body ?? "{}")).toEqual({ near: "position", lat: 42.7, lng: 2.9 });
  expect(at?.url).not.toMatch(/42\.7|2\.9|lat|lng/);
  for (const r of requests) {
    for (const needle of ["42.7049", "2.8954", "42.704937", "2.895412"]) {
      expect(r.url, r.url).not.toContain(needle);
      expect(r.body ?? "", r.url).not.toContain(needle);
    }
  }
  // Les deux sources n'ont reçu que des codes de département.
  const seen = await stub();
  for (const c of seen.received) {
    expect(c.department).toMatch(/^[0-9][0-9AB]$/);
    expect(`${c.url} ${decodeURIComponent(c.body)}`).not.toMatch(/42\.7|2\.89|around|latitude|longitude/);
  }
  // Rien dans le stockage du navigateur.
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(stored).not.toMatch(/42\.704937|2\.895412|42\.70494|2\.89541/);
  // Sens unique : la météo garde sa ville (un geste dans « Pratique » ne la relance pas).
  await expect(page.getByTestId("home-weather")).not.toContainText("· ma position");
  await shot(page, "appli-position-beton-384");
  await ctx.close();
});

test("position refusée : la ville, sans message d'erreur", async ({ browser }) => {
  const { ctx, page } = await open(browser);
  const block = await blockReady(page);
  await block.getByTestId("practical-use-position").click();
  await page.waitForTimeout(2500);
  await expect(block.getByTestId("practical-hint")).toContainText("Autour de Perpignan, ta ville.");
  await expect(block).not.toContainText(/erreur|refus|impossible/i);
  await expect(block.getByTestId("practical-use-position")).toBeVisible();
  await shot(page, "appli-position-refusee-beton-384");
  await ctx.close();
});

test("près de ma sortie : le sélecteur, la ligne « Autour de … », les distances de l'événement", async ({
  browser,
}) => {
  const { ctx, page } = await open(browser, { email: WITH_OUTING });
  const block = await blockReady(page);
  await expect(block.getByTestId("practical-choice")).toBeVisible();
  await expect(block.getByTestId("practical-choice-me")).toContainText("Près de moi");
  await expect(block.getByTestId("practical-choice-outing")).toContainText("Près de ma sortie");
  await block.getByTestId("practical-choice-outing").click();
  await expect(block.getByTestId("practical-hint")).toContainText(/Autour de .+, l'événement où tu vas\./);
  await expect(block.getByTestId("practical-use-position")).toHaveCount(0);
  await expect(block.getByTestId("practical-wash")).toContainText(/ · \d+,\d\skm/);
  await shot(page, "appli-sortie-beton-384");
  // « Voir tout » garde ce choix.
  await block.getByRole("link", { name: "Voir tout" }).click();
  await expect(page.getByTestId("practical-list")).toBeVisible();
  await expect(page.getByTestId("practical-hint").last()).toContainText(/l'événement où tu vas\./);
  await ctx.close();
});

test("rien à moins de 30 km : une ville sans lieu proche", async ({ browser }) => {
  const cookie = cookies[NO_OUTING] ?? null;
  await apiCall(cookie, "PUT", "/me/weather/places", { places: [{ label: "Toulouse", lat: 43.6, lng: 1.44 }] });
  const { ctx, page } = await open(browser);
  const block = page.getByTestId("home-practical");
  await expect(block.getByTestId("practical-empty")).toContainText("Rien à moins de 30 km.", { timeout: 30_000 });
  await expect(block.getByTestId("practical-hint")).toContainText("Autour de Toulouse, ta ville.");
  await shot(page, "appli-rien-beton-384");
  await apiCall(cookie, "PUT", "/me/weather/places", { places: [] });
  await ctx.close();
});

test("source muette : le bloc se replie sur une ligne, sans erreur", async ({ browser }) => {
  const cookie = cookies[NO_OUTING] ?? null;
  // Une ville dont les départements n'ont encore rien en cache, et les sources en panne.
  await apiCall(cookie, "PUT", "/me/weather/places", { places: [{ label: "Brest", lat: 48.39, lng: -4.49 }] });
  await fetch(`${STUB}/__stub?down=1`);
  const { ctx, page } = await open(browser);
  const block = page.getByTestId("home-practical");
  await expect(block.getByTestId("practical-unavailable")).toContainText("indisponibles", { timeout: 40_000 });
  await expect(block).not.toContainText(/erreur|échec/i);
  await shot(page, "appli-source-muette-beton-384");
  await fetch(`${STUB}/__stub?down=0`);
  await apiCall(cookie, "PUT", "/me/weather/places", { places: [] });
  await ctx.close();
});

test("« Voir tout » : liste, filtres, carte, lieu touché, « Y aller » principal, bascule collée en bas", async ({
  browser,
}) => {
  const { ctx, page } = await open(browser, { email: WITH_OUTING, theme: "sable" });
  const block = await blockReady(page);
  await block.getByRole("link", { name: "Voir tout" }).click();
  await expect(page.getByText("Stations-service et lavage")).toBeVisible();
  const list = page.getByTestId("practical-list");
  await expect(list).toBeVisible();
  await expect(page.getByTestId("practical-row-0")).toContainText(/Station-service|Lavage/);
  await shot(page, "appli-liste-sable-384");
  const all = await list.getByTestId(/practical-row-\d+$/).count();
  expect(all).toBeGreaterThan(2);
  // Triée par distance : les km ne décroissent jamais.
  const kms = (await list.getByTestId(/practical-row-\d+$/).allInnerTexts()).map((t) =>
    Number((/(\d+(?:,\d)?)\skm/.exec(t) ?? [])[1]?.replace(",", ".")),
  );
  expect(kms).toEqual([...kms].sort((a, b) => a - b));
  // Filtres.
  await page.getByText("Stations-service", { exact: true }).click();
  await expect(list.getByText("Lavage ·", { exact: false })).toHaveCount(0);
  await expect(list).toContainText("Station-service ·");
  await shot(page, "appli-filtre-stations-sable-384");
  await page.getByText("Lavage", { exact: true }).first().click();
  await expect(list.getByText("Station-service ·", { exact: false })).toHaveCount(0);
  await expect(list).toContainText("Lavage ·");
  await page.getByText("Tout", { exact: true }).click();
  // La carte : une épingle par lieu, le plus proche déjà choisi, « Y aller » principal.
  await page.getByTestId("map-toggle").click();
  await expect(page.getByTestId("practical-map-view")).toBeVisible();
  const pins = page.locator('[data-testid^="practical-pin-"]');
  await expect(pins.first()).toBeVisible({ timeout: 30_000 });
  expect(await pins.count()).toBe(all);
  await expect(page.getByTestId("practical-selected")).toBeVisible();
  await expect(page.getByTestId("practical-selected")).toContainText(/ · \d+,\d\skm/);
  await shot(page, "appli-carte-sable-384");
  // Toucher une autre épingle change le lieu sélectionné.
  const before = await page.getByTestId("practical-selected").innerText();
  // Les stations voisines se recouvrent sur la carte cadrée sur 30 km : le clic part directement sur l'épingle visée.
  await pins.nth(2).dispatchEvent("click");
  await expect(page.getByTestId("practical-selected")).not.toHaveText(before);
  await page.getByTestId("practical-selected-go").click();
  await expect(page.getByTestId("go-maps")).toBeVisible();
  await expect(page.getByTestId("go-waze")).toBeVisible();
  await shot(page, "appli-carte-y-aller-sable-384");
  // Le dernier choix est retenu pendant la séance : retour à l'Accueil puis « Voir tout » rouvre la carte.
  await page.keyboard.press("Escape");
  await page.getByTestId("list-toggle").click();
  await expect(page.getByTestId("practical-list")).toBeVisible();
  await ctx.close();
});

test("carte d'une sortie : « … de l'événement » et l'épingle de l'événement", async ({ browser }) => {
  const { ctx, page } = await open(browser, { email: WITH_OUTING });
  const block = await blockReady(page);
  await block.getByTestId("practical-choice-outing").click();
  await block.getByRole("link", { name: "Voir tout" }).click();
  await page.getByTestId("map-toggle").click();
  await expect(page.getByTestId("practical-selected")).toContainText("de l'événement", { timeout: 30_000 });
  await expect(page.locator('[data-testid="practical-event"]')).toBeVisible();
  await shot(page, "appli-carte-sortie-beton-384");
  await ctx.close();
});

test("police ×1,3 à 384 px : le sélecteur et les lignes ne se coupent pas, pas de défilement horizontal", async ({
  browser,
}) => {
  const { ctx, page } = await open(browser, { scale: 1.3, email: WITH_OUTING });
  const block = await blockReady(page);
  await expect(block.getByTestId("practical-choice-outing")).toContainText("Près de ma sortie");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await shot(page, "appli-bloc-beton-384-x1.3");
  await block.getByRole("link", { name: "Voir tout" }).click();
  await expect(page.getByTestId("practical-list")).toBeVisible();
  await shot(page, "appli-liste-beton-384-x1.3");
  await ctx.close();
});

test("390 px : le bloc et la liste, Béton", async ({ browser }) => {
  const { ctx, page } = await open(browser, { width: 390, email: WITH_OUTING });
  const block = await blockReady(page);
  await shot(page, "appli-bloc-beton-390");
  await block.getByRole("link", { name: "Voir tout" }).click();
  await expect(page.getByTestId("practical-list")).toBeVisible();
  await shot(page, "appli-liste-beton-390");
  await ctx.close();
});

test("hors ligne : la dernière réponse de la séance, jamais une donnée fausse", async ({ browser }) => {
  const { ctx, page } = await open(browser);
  const block = await blockReady(page);
  await block.getByRole("link", { name: "Voir tout" }).click();
  await expect(page.getByTestId("practical-list")).toBeVisible();
  await ctx.setOffline(true);
  await page.getByRole("button", { name: "Retour" }).first().click();
  await expect(page.getByTestId("home-practical")).toContainText("Station-service la plus proche");
  await shot(page, "appli-hors-ligne-beton-384");
  await ctx.setOffline(false);
  await ctx.close();
});

test("tour 2 : deux positions dans la même séance, « Me relocaliser » ; la seconde remplace la première", async ({
  browser,
}) => {
  const { ctx, page } = await open(browser, { geo: true });
  const posted: { lat: number; lng: number }[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/practical") && r.method() === "POST") {
      const body = JSON.parse(r.postData() ?? "{}");
      if (body.near === "position") posted.push({ lat: body.lat, lng: body.lng });
    }
  });
  const block = await blockReady(page);
  await page.evaluate(() => {
    const w = window as unknown as { __gps: number };
    w.__gps = 0;
    const g = navigator.geolocation;
    const original = g.getCurrentPosition.bind(g);
    g.getCurrentPosition = (...args) => {
      w.__gps += 1;
      return original(...args);
    };
  });
  await block.getByTestId("practical-use-position").click();
  await expect(block.getByTestId("practical-use-position")).toContainText("Me relocaliser", { timeout: 20_000 });
  expect(posted.at(0)).toEqual({ lat: 42.7, lng: 2.9 });
  // Un geste dans « Pratique » : une lecture de l'appareil et un POST de position, la météo n'est pas relancée.
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => (window as unknown as { __gps: number }).__gps)).toBe(1);
  expect(posted).toHaveLength(1);

  await ctx.setGeolocation({ latitude: 42.552, longitude: 3.031 });
  await block.getByTestId("practical-use-position").click();
  await expect.poll(() => posted.some((p) => p.lat === 42.6 || p.lat === 42.5)).toBe(true);
  expect(posted.at(-1)).toEqual({ lat: 42.6, lng: 3 });
  await expect(block.getByTestId("practical-use-position")).toContainText("Me relocaliser");
  await ctx.close();
});

test("tour 2 : premier échec réseau, puis reprise sans quitter l'Accueil", async ({ browser }) => {
  const { ctx, page } = await open(browser, { offline: true });
  await expect(page.getByTestId("home-practical").getByTestId("practical-fuel")).toHaveCount(0);
  await ctx.unroute(/\/api\/practical/);
  await expect(page.getByTestId("home-practical").getByTestId("practical-fuel")).toBeVisible({ timeout: 40_000 });
  await ctx.close();
});

// Matrice de captures (CAPTURES_MATRIX=1) : le bloc et l'écran, Béton et Sable, 384 et 390 px, police ×1 et ×1,3.
test.describe("matrice de captures", () => {
  test.skip(!process.env.CAPTURES_MATRIX, "CAPTURES_MATRIX=1 pour la matrice de captures");
  for (const theme of ["beton", "sable"]) {
    for (const [width, scale] of [
      [384, 1],
      [384, 1.3],
      [390, 1],
      [390, 1.3],
    ] as const) {
      test(`${theme} ${width} ×${scale}`, async ({ browser }) => {
        const tag = `${theme}-${width}${scale > 1 ? `-x${scale}` : ""}`;
        const { ctx, page } = await open(browser, { theme, width, scale, email: WITH_OUTING });
        const block = await blockReady(page);
        await page.getByTestId("practical-head").scrollIntoViewIfNeeded();
        await shot(page, `matrice-bloc-moi-${tag}`);
        await block.getByTestId("practical-choice-outing").click();
        await expect(block.getByTestId("practical-hint")).toContainText("l'événement où tu vas");
        await shot(page, `matrice-bloc-sortie-${tag}`);
        await block.getByRole("link", { name: "Voir tout" }).click();
        await expect(page.getByTestId("practical-list")).toBeVisible();
        await shot(page, `matrice-liste-${tag}`);
        await page.getByTestId("map-toggle").click();
        await expect(page.locator('[data-testid^="practical-pin-"]').first()).toBeVisible({ timeout: 30_000 });
        await shot(page, `matrice-carte-${tag}`);
        await ctx.close();
      });
    }
  }
});

// Captures « avant » (CAPTURES_AVANT=1) : l'Accueil tel qu'il était sans le bloc (le bloc « Pratique » est masqué dans Personnaliser),
// sous « Ma météo », Béton et Sable, 384 et 390 px, police ×1 et ×1,3. Rangées dans CAPTURES_DIR (le dossier « avant »).
test.describe("captures avant", () => {
  test.skip(!process.env.CAPTURES_AVANT, "CAPTURES_AVANT=1 pour les captures « avant »");
  for (const theme of ["beton", "sable"]) {
    for (const [width, scale] of [
      [384, 1],
      [384, 1.3],
      [390, 1],
      [390, 1.3],
    ] as const) {
      test(`avant ${theme} ${width} ×${scale}`, async ({ browser }) => {
        const cookie = cookies[WITH_OUTING] ?? null;
        await apiCall(cookie, "PUT", "/me/home/widgets", {
          order: [],
          hidden: ["live", "agenda", "favorite_garage", "pending", "practical"],
        });
        const tag = `${theme}-${width}${scale > 1 ? `-x${scale}` : ""}`;
        const { ctx, page } = await open(browser, { theme, width, scale, email: WITH_OUTING });
        await expect(page.getByTestId("home-weather")).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId("home-practical")).toHaveCount(0);
        await page.getByTestId("home-weather").scrollIntoViewIfNeeded();
        await shot(page, `avant-accueil-${tag}`);
        await ctx.close();
        await apiCall(cookie, "PUT", "/me/home/widgets", {
          order: [],
          hidden: ["live", "agenda", "favorite_garage", "pending"],
        });
      });
    }
  }
});
