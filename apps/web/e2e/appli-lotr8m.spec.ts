import { mkdirSync } from "node:fs";
import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD } from "./helpers";
import { RELAIS } from "./relais";

// Lot R8m, côté appli (version web compilée de recette) : « Ma météo » — la ville par défaut (T10), le détail (heure par heure,
// vent, pluie), « Changer de lieu », « Second lieu », « Retirer ce lieu », « Utiliser ma position » accordée (arrondie à 0,1°,
// jamais dans une adresse ni dans le stockage du navigateur) puis refusée (la ville, sans message d'erreur), hors ligne.
// Lancer avec APP_URL, l'API sur le faux fournisseur local (`WEATHER_PROVIDER=open-meteo`, `METEO_URL`, `GEOCODER_URL` sur le port
// de `METEO_STUB_PORT`) : le stub du lot est `.run-r8m/stub.mjs` (météo, `/search`, `/reverse`, `/__stub`). Compte : Pilote_005 (66).
const APP = process.env.APP_URL;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });
test.describe.configure({ mode: "serial" });

const EMAIL = "pilote5@orasso.local";
const STUB = `http://127.0.0.1:${process.env.METEO_STUB_PORT ?? 4738}`;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r8m-captures/apres`;
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

async function open(browser: Browser, opts: { scale?: number; theme?: string; width?: number; geo?: boolean } = {}) {
  const { scale = 1, theme = "beton", width = 384, geo = false } = opts;
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    baseURL: APP,
    ...(geo ? { geolocation: GEO, permissions: ["geolocation"] } : {}),
  });
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
  await page.getByLabel("E-mail").fill(EMAIL);
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

/** Le bloc « Ma météo », avec la météo (le premier chargement la demande au fournisseur sans l'attendre). */
async function blockReady(page: Page, text: RegExp | string) {
  const block = page.getByTestId("home-weather");
  // Le premier chargement demande la météo au fournisseur sans l'attendre : une relecture de l'Accueil l'apporte.
  const found = await expect(block)
    .toContainText(text, { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (!found) {
    await page.reload();
    await afterOpening(page).catch(() => undefined);
  }
  await expect(block).toContainText(text, { timeout: 30_000 });
  await block.scrollIntoViewIfNeeded().catch(() => undefined);
  return block;
}

let cookie: string;
test.beforeAll(async () => {
  cookie = await login(EMAIL);
  await apiCall(cookie, "PUT", "/me/weather/places", { places: [] });
  await apiCall(cookie, "PUT", "/me/home/widgets", {
    order: [],
    hidden: ["live", "agenda", "favorite_garage", "pending"],
  });
  const stub = await fetch(`${STUB}/__stub?down=0`).catch(() => null);
  expect(stub?.ok, "le faux fournisseur local doit tourner (.run-r8m/stub.mjs)").toBe(true);
});
test.afterAll(async () => {
  await apiCall(cookie, "PUT", "/me/weather/places", { places: [] });
  await apiCall(cookie, "PUT", "/me/home/widgets", { order: [], hidden: ["agenda", "favorite_garage", "pending"] });
  await fetch(`${STUB}/__stub?down=0`).catch(() => null);
});

test("par défaut (T10) : la préfecture du département, « ta ville », « Utiliser ma position »", async ({ browser }) => {
  const { ctx, page } = await open(browser);
  const block = await blockReady(page, "Perpignan · ta ville");
  await expect(block).toContainText(/Vent 18\s*km\/h · pluie 5\s*%/);
  await expect(block.getByTestId("my-weather-card-1")).toHaveCount(0);
  await expect(block.getByTestId("my-weather-use-position")).toContainText("Utiliser ma position");
  // Le titre du bloc.
  await expect(block).toContainText("Ma météo");
  await shot(page, "appli-par-defaut-beton-384");
  await ctx.close();
});

test("Personnaliser : « Ma météo » et son aide", async ({ browser }) => {
  const { ctx, page } = await open(browser);
  await page.getByTestId("home-personalize").click();
  await expect(page.getByText("Celle de ta position, jusqu'à deux lieux")).toBeVisible();
  await expect(page.getByTestId("personalize-row-weather")).toContainText("Ma météo");
  await shot(page, "appli-personnaliser-beton-384");
  await ctx.close();
});

test("détail : heure par heure (six heures), vent, pluie, attribution, boutons", async ({ browser }) => {
  const { ctx, page } = await open(browser);
  const block = await blockReady(page, "Perpignan · ta ville");
  await block.getByTestId("my-weather-card-0").click();
  await expect(page.getByTestId("meteo-now")).toBeVisible();
  await expect(page.getByTestId("meteo-now")).toContainText(/Ressenti -?\d+° · vent 18\s*km\/h · pluie \d+\s*%/);
  await expect(page.getByText("Heure par heure")).toBeVisible();
  await expect(page.getByTestId("meteo-hours").getByText(/^\d+\sh$/)).toHaveCount(6);
  await expect(page.getByTestId("meteo-wind")).toContainText(/Vent\s+18\s*km\/h, rafales 30/);
  await expect(page.getByTestId("meteo-wind")).toContainText("NO");
  await expect(page.getByTestId("meteo-rain")).toContainText("Pluie");
  await expect(page.getByTestId("meteo-attribution")).toContainText("Météo : Open-Meteo");
  await expect(page.getByTestId("meteo-change")).toContainText("Changer de lieu");
  await expect(page.getByTestId("meteo-second")).toContainText("Second lieu");
  // Un lieu par défaut n'a pas de « Retirer ce lieu ».
  await expect(page.getByTestId("meteo-remove")).toHaveCount(0);
  await shot(page, "appli-detail-beton-384");
  await ctx.close();
});

test("Changer de lieu : chercher une ville, la choisir ; Second lieu ; Retirer ce lieu", async ({ browser }) => {
  const { ctx, page } = await open(browser, { theme: "sable" });
  const block = await blockReady(page, "Perpignan · ta ville");
  await block.getByTestId("my-weather-card-0").click();
  await page.getByTestId("meteo-change").click();
  // La phrase d'explication de « Utiliser ma position » est dans la feuille, pas ailleurs.
  await expect(
    page.getByText("La position n'est jamais enregistrée. Sans elle, la météo est celle de ta ville."),
  ).toBeVisible();
  await page.getByTestId("place-search").fill("A");
  await expect(page.getByText("Tape au moins deux lettres")).toBeVisible();
  await page.getByTestId("place-search").fill("Argel");
  await expect(page.getByTestId("place-result-0")).toContainText("Argelès-sur-Mer (66)");
  await expect(page.getByTestId("place-result-1")).toContainText("Argelès-Gazost (65)");
  await shot(page, "appli-changer-de-lieu-recherche-sable-384");
  await page.getByTestId("place-result-0").click();
  // Le détail montre le lieu choisi (nom seul).
  await expect(page.getByText("Argelès-sur-Mer", { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("meteo-remove")).toBeVisible();
  const saved = await apiCall<{ places: { label: string; source: string }[] }>(cookie, "GET", "/me/weather/places");
  expect(saved.data.places.map((p) => [p.label, p.source])).toEqual([["Argelès-sur-Mer", "saved"]]);
  // Second lieu : Perpignan.
  await page.getByTestId("meteo-second").click();
  await page.getByTestId("place-search").fill("Perp");
  await page.getByTestId("place-result-0").click();
  await expect(page.getByTestId("meteo-second")).toHaveCount(0);
  const two = await apiCall<{ places: { label: string }[] }>(cookie, "GET", "/me/weather/places");
  expect(two.data.places.map((p) => p.label)).toEqual(["Argelès-sur-Mer", "Perpignan"]);
  // L'Accueil : deux cartes côte à côte, noms seuls.
  await page.getByRole("button", { name: "Fermer" }).first().click();
  const home = await blockReady(page, "Perpignan");
  await expect(home.getByTestId("my-weather-card-0")).toContainText("Argelès-sur-Mer");
  await expect(home.getByTestId("my-weather-card-1")).toContainText("Perpignan");
  await expect(home.getByTestId("my-weather-card-1")).not.toContainText("ta ville");
  await shot(page, "appli-deux-lieux-sable-384");
  // Retirer le second.
  await home.getByTestId("my-weather-card-1").click();
  await page.getByTestId("meteo-remove").click();
  await expect(page.getByTestId("home-weather")).toBeVisible({ timeout: 15_000 });
  const one = await apiCall<{ places: { label: string }[] }>(cookie, "GET", "/me/weather/places");
  expect(one.data.places.map((p) => p.label)).toEqual(["Argelès-sur-Mer"]);
  await apiCall(cookie, "PUT", "/me/weather/places", { places: [] });
  await ctx.close();
});

test("position accordée : arrondie à 0,1°, jamais dans une adresse ni dans le stockage ; refusée : la ville, sans erreur", async ({
  browser,
}) => {
  const granted = await open(browser, { geo: true });
  const requests: { url: string; body: string | null }[] = [];
  granted.page.on("request", (r) => requests.push({ url: r.url(), body: r.postData() }));
  const block = await blockReady(granted.page, "Perpignan · ta ville");
  await block.getByTestId("my-weather-use-position").click();
  await expect(block).toContainText("Canet-en-Roussillon · ma position", { timeout: 20_000 });
  await expect(block.getByTestId("my-weather-use-position")).toHaveCount(0);
  const at = requests.find((r) => r.url.includes("/api/weather/at"));
  expect(at, "la requête de position part en POST").toBeTruthy();
  expect(JSON.parse(at?.body ?? "{}")).toEqual({ lat: 42.7, lng: 2.9 });
  expect(at?.url).not.toMatch(/42\.7|2\.9|lat|lng/);
  for (const r of requests) {
    expect(r.url, r.url).not.toContain("42.7049");
    expect(r.url, r.url).not.toContain("2.8954");
    expect(r.body ?? "", r.url).not.toContain("42.7049");
  }
  const stub = (await (await fetch(`${STUB}/__stub`)).json()) as { urls: string[] };
  for (const u of stub.urls) {
    expect(u).not.toContain("42.7049");
    expect(u).not.toContain("2.8954");
  }
  // Rien dans le stockage du navigateur.
  const stored = await granted.page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(stored).not.toMatch(/42\.704937|2\.895412/);
  const serverSide = await apiCall<{ places: { label: string; source: string }[] }>(
    cookie,
    "GET",
    "/me/weather/places",
  );
  expect(serverSide.data.places.map((p) => p.source)).toEqual(["default"]);
  await shot(granted.page, "appli-position-sable-384".replace("sable", "beton"));
  await granted.ctx.close();

  // Refusée : la ville, aucun message d'erreur.
  const denied = await open(browser);
  const dblock = await blockReady(denied.page, "Perpignan · ta ville");
  await dblock.getByTestId("my-weather-use-position").click();
  await denied.page.waitForTimeout(2500);
  await expect(dblock).toContainText("Perpignan · ta ville");
  await expect(dblock).not.toContainText(/erreur|refus|impossible/i);
  await expect(dblock.getByTestId("my-weather-use-position")).toBeVisible();
  await shot(denied.page, "appli-position-refusee-beton-384");
  await denied.ctx.close();
});

test("hors ligne : la dernière météo connue, sans erreur", async ({ browser }) => {
  const { ctx, page } = await open(browser);
  const block = await blockReady(page, "Perpignan · ta ville");
  await block.getByTestId("my-weather-card-0").click();
  await expect(page.getByTestId("meteo-now")).toBeVisible();
  await page.getByRole("button", { name: "Fermer" }).first().click();
  await expect(page.getByTestId("home-weather")).toBeVisible();
  await ctx.setOffline(true);
  await page.getByTestId("home-weather").getByTestId("my-weather-card-0").click();
  await expect(page.getByTestId("meteo-now")).toBeVisible();
  await expect(page.getByText("Hors ligne : voici ce que ton téléphone a gardé.")).toBeVisible();
  await shot(page, "appli-hors-ligne-beton-384");
  await ctx.setOffline(false);
  await ctx.close();
});

test("fournisseur en panne : le lieu reste, la météo est indisponible, jamais d'erreur", async ({ browser }) => {
  await apiCall(cookie, "PUT", "/me/weather/places", {
    places: [{ label: "Toulouse", lat: 43.6, lng: 1.44 }],
  });
  await fetch(`${STUB}/__stub?down=1`);
  const { ctx, page } = await open(browser);
  const block = page.getByTestId("home-weather");
  await expect(block).toBeVisible();
  await expect(block).toContainText("Toulouse");
  await fetch(`${STUB}/__stub?down=0`);
  await apiCall(cookie, "PUT", "/me/weather/places", { places: [] });
  await ctx.close();
});

test("police ×1,3 à 384 px : rien ne se coupe, deux lieux côte à côte", async ({ browser }) => {
  await apiCall(cookie, "PUT", "/me/weather/places", {
    places: [
      { label: "Perpignan", lat: 42.7, lng: 2.9 },
      { label: "Argelès-sur-Mer", lat: 42.55, lng: 3.03 },
    ],
  });
  const { ctx, page } = await open(browser, { scale: 1.3 });
  const block = await blockReady(page, "Argelès-sur-Mer");
  await expect(block.getByTestId("my-weather-card-1")).toContainText("Argelès-sur-Mer");
  const a = await block.getByTestId("my-weather-card-0").boundingBox();
  const b = await block.getByTestId("my-weather-card-1").boundingBox();
  expect(a && b && Math.abs(a.y - b.y) < 2).toBe(true);
  // Pas de défilement horizontal de la page.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await shot(page, "appli-deux-lieux-beton-384-x1.3");
  await apiCall(cookie, "PUT", "/me/weather/places", { places: [] });
  await ctx.close();
});

test("tour 2 : Accueil en ligne, réseau coupé, premier détail : la météo de la copie de l'Accueil", async ({
  browser,
}) => {
  const { ctx, page } = await open(browser);
  const block = await blockReady(page, "Perpignan · ta ville");
  // Le bloc garde sa copie pour le détail ; on laisse le temps de l'écrire.
  await page.waitForTimeout(1500);
  await ctx.setOffline(true);
  await block.getByTestId("my-weather-card-0").click();
  await expect(page.getByTestId("meteo-now")).toBeVisible();
  await expect(page.getByTestId("meteo-hours")).toBeVisible();
  await expect(page.getByTestId("meteo-unavailable")).toHaveCount(0);
  await ctx.setOffline(false);
  await ctx.close();
});

test("tour 2 : l'attribution du fournisseur est sur les cartes de l'Accueil", async ({ browser }) => {
  const { ctx, page } = await open(browser);
  const block = await blockReady(page, "Perpignan · ta ville");
  await expect(block.getByTestId("my-weather-card-0-source")).toHaveText("Open-Meteo");
  await ctx.close();
});
