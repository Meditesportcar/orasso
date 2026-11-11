import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser } from "./helpers";
import { RELAIS } from "./relais";

// Lot R8m, côté site : « Ma météo » — la ville par défaut (T10), le détail, « Changer de lieu » (recherche d'une ville, formulaire),
// « Second lieu », « Retirer ce lieu », « Utiliser ma position » accordée (arrondie à 0,1°, jamais dans une adresse ni dans le
// stockage du navigateur) puis refusée (la ville, sans message d'erreur), à 390 et 1280 px. L'API tourne sur le faux fournisseur
// local de `.run-r8m/stub.mjs` (météo, `/search`, `/reverse`, `/__stub`), comme `appli-lotr8m.spec.ts`. Compte : Pilote_008 (66).
test.use({ actionTimeout: 30_000 });
test.describe.configure({ mode: "serial" });

const EMAIL = "pilote8@orasso.local";
const STUB = `http://127.0.0.1:${process.env.METEO_STUB_PORT ?? 4738}`;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r8m-captures/apres`;
const SHOTS = Boolean(process.env.CAPTURES);
if (SHOTS) mkdirSync(DIR, { recursive: true });
const GEO = { latitude: 42.704937, longitude: 2.895412 };

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
});

async function openHome(
  browser: import("@playwright/test").Browser,
  opts: { width?: number; theme?: string; geo?: boolean } = {},
) {
  const { width = 390, theme = "beton", geo = false } = opts;
  const ctx = await browser.newContext({
    viewport: { width, height: width === 390 ? 844 : 900 },
    ...(geo ? { geolocation: GEO, permissions: ["geolocation"] } : {}),
  });
  await ctx.addInitScript((t) => localStorage.setItem("orasso.theme", t), theme);
  const page = await ctx.newPage();
  await loginInBrowser(page, EMAIL, undefined, "/app");
  await page.goto("/app");
  await page.waitForLoadState("networkidle");
  return { ctx, page };
}

/** Le premier chargement demande la météo au fournisseur sans l'attendre : on recharge jusqu'à l'avoir. */
async function weatherBlock(page: Page, text: RegExp | string) {
  const block = page.getByTestId("widget-weather");
  for (let i = 0; i < 4; i++) {
    if (
      await block
        .getByText(text)
        .first()
        .isVisible()
        .catch(() => false)
    )
      break;
    await page.waitForTimeout(1500);
    await page.reload();
    await page.waitForLoadState("networkidle");
  }
  await expect(block).toContainText(text);
  await block.scrollIntoViewIfNeeded();
  return block;
}

const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
};

for (const width of [390, 1280]) {
  test(`${width} px : par défaut (T10), détail, Changer de lieu, Second lieu, Retirer ce lieu`, async ({ browser }) => {
    // `PUT /me/weather/places` est limité à 10 par minute et par compte : la fenêtre de la série précédente doit être passée.
    if (width === 1280) await new Promise((r) => setTimeout(r, 62_000));
    await apiCall(cookie, "PUT", "/me/weather/places", { places: [] });
    const { ctx, page } = await openHome(browser, { width, theme: width === 390 ? "beton" : "sable" });
    const block = await weatherBlock(page, "Perpignan · ta ville");
    await expect(block).toContainText("Ma météo");
    await expect(block).toContainText(/Vent 18\s*km\/h · pluie 5\s*%/);
    await expect(block.getByTestId("my-weather-use-position")).toContainText("Utiliser ma position");
    await shot(page, `site-par-defaut-${width}`);

    // Détail.
    await block.getByTestId("my-weather-card-0").click();
    await page.waitForURL(/\/app\/meteo/);
    await expect(page.getByTestId("meteo-now")).toContainText(/Ressenti -?\d+° · vent 18\s*km\/h/);
    await expect(page.getByText("Heure par heure")).toBeVisible();
    await expect(page.getByTestId("meteo-hours").locator("li")).toHaveCount(6);
    await expect(page.getByTestId("meteo-wind")).toContainText(/Vent\s+18\s*km\/h, rafales 30/);
    await expect(page.getByTestId("meteo-wind")).toContainText("NO");
    await expect(page.getByTestId("meteo-attribution")).toContainText("Météo : Open-Meteo");
    await expect(page.getByTestId("meteo-remove")).toHaveCount(0);
    await shot(page, `site-detail-${width}`);

    // Changer de lieu : une ville cherchée (formulaire), choisie (formulaire).
    await page.getByTestId("meteo-change").click();
    await expect(
      page.getByText("La position n'est jamais enregistrée. Sans elle, la météo est celle de ta ville."),
    ).toBeVisible();
    await page.getByTestId("place-search").fill("Argel");
    await page.getByTestId("place-search-submit").click();
    await expect(page.getByTestId("place-result-0")).toContainText("Argelès-sur-Mer (66)");
    await expect(page.getByTestId("place-result-1")).toContainText("Argelès-Gazost (65)");
    await shot(page, `site-changer-de-lieu-${width}`);
    await page.getByTestId("place-result-0").click();
    await page.waitForURL(/\/app\/meteo$/);
    await expect(page.getByText("Argelès-sur-Mer", { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("meteo-remove")).toBeVisible();
    let saved = await apiCall<{ places: { label: string; source: string }[] }>(cookie, "GET", "/me/weather/places");
    expect(saved.data.places.map((p) => [p.label, p.source])).toEqual([["Argelès-sur-Mer", "saved"]]);

    // Second lieu : Perpignan.
    await page.getByTestId("meteo-second").click();
    await page.getByTestId("place-search").fill("Perp");
    await page.getByTestId("place-search-submit").click();
    await page.getByTestId("place-result-0").click();
    await page.waitForURL(/\/app\/meteo$/);
    await expect(page.getByTestId("meteo-second")).toHaveCount(0);
    saved = await apiCall(cookie, "GET", "/me/weather/places");
    expect(saved.data.places.map((p) => p.label)).toEqual(["Argelès-sur-Mer", "Perpignan"]);

    // L'Accueil : deux cartes côte à côte, noms seuls.
    await page.goto("/app");
    const home = await weatherBlock(page, "Perpignan");
    await expect(home.getByTestId("my-weather-card-0")).toContainText("Argelès-sur-Mer");
    await expect(home.getByTestId("my-weather-card-1")).toContainText("Perpignan");
    await expect(home.getByTestId("my-weather-card-1")).not.toContainText("ta ville");
    const a = await home.getByTestId("my-weather-card-0").boundingBox();
    const b = await home.getByTestId("my-weather-card-1").boundingBox();
    expect(a && b && Math.abs(a.y - b.y) < 2).toBe(true);
    await shot(page, `site-deux-lieux-${width}`);

    // Retirer le second lieu.
    await home.getByTestId("my-weather-card-1").click();
    await page.getByTestId("meteo-remove").click();
    await page.waitForURL(/\/app\/meteo$/);
    saved = await apiCall(cookie, "GET", "/me/weather/places");
    expect(saved.data.places.map((p) => p.label)).toEqual(["Argelès-sur-Mer"]);
    await apiCall(cookie, "PUT", "/me/weather/places", { places: [] });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await ctx.close();
  });
}

test("position accordée : arrondie à 0,1°, jamais dans une adresse ni dans le stockage ; refusée : la ville, sans erreur", async ({
  browser,
}) => {
  const granted = await openHome(browser, { geo: true });
  const requests: { url: string; body: string | null }[] = [];
  granted.page.on("request", (r) => requests.push({ url: r.url(), body: r.postData() }));
  const block = await weatherBlock(granted.page, "Perpignan · ta ville");
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
  const stored = await granted.page.evaluate(
    () => `${JSON.stringify({ ...localStorage, ...sessionStorage })} ${document.cookie}`,
  );
  expect(stored).not.toMatch(/42\.7049|2\.8954|42\.704937|2\.895412|Canet-en-Roussillon/);
  const serverSide = await apiCall<{ places: { source: string }[] }>(cookie, "GET", "/me/weather/places");
  expect(serverSide.data.places.map((p) => p.source)).toEqual(["default"]);
  await shot(granted.page, "site-position-390");
  // La carte « ma position » ouvre le détail de cet endroit.
  await block.getByTestId("my-weather-card-0").click();
  await granted.page.waitForURL(/\/app\/meteo/);
  await expect(granted.page.getByText("Canet-en-Roussillon · ma position")).toBeVisible();
  await granted.ctx.close();

  const denied = await openHome(browser);
  const dblock = await weatherBlock(denied.page, "Perpignan · ta ville");
  await dblock.getByTestId("my-weather-use-position").click();
  await denied.page.waitForTimeout(2500);
  await expect(dblock).toContainText("Perpignan · ta ville");
  await expect(dblock).not.toContainText(/erreur|refus|impossible/i);
  await expect(dblock.getByTestId("my-weather-use-position")).toBeVisible();
  await shot(denied.page, "site-position-refusee-390");
  await denied.ctx.close();
});

test("sans département ni lieu : « Choisis ta ville »", async ({ browser }) => {
  const cookie26 = await login("pilote26@orasso.local");
  await apiCall(cookie26, "PUT", "/me/home/widgets", {
    order: [],
    hidden: ["live", "agenda", "favorite_garage", "pending"],
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await loginInBrowser(page, "pilote26@orasso.local", undefined, "/app");
  await page.goto("/app");
  await page.waitForLoadState("networkidle");
  const block = page.getByTestId("widget-weather");
  await expect(block.getByTestId("my-weather-choose")).toContainText("Choisis ta ville");
  await block.getByTestId("my-weather-choose").click();
  await page.waitForURL(/\/app\/meteo/);
  await expect(page.getByTestId("meteo-empty")).toContainText("Choisis ta ville");
  await shot(page, "site-sans-lieu-390");
  await ctx.close();
});

test("tour 2 : la session change sans rechargement (expiration puis autre compte) : la position de A disparaît", async ({
  browser,
}) => {
  const a = await openHome(browser, { geo: true });
  const requests: { url: string; body: string | null }[] = [];
  a.page.on("request", (r) => requests.push({ url: r.url(), body: r.postData() }));
  const block = await weatherBlock(a.page, "Perpignan · ta ville");
  await block.getByTestId("my-weather-use-position").click();
  await expect(block).toContainText("Canet-en-Roussillon · ma position", { timeout: 20_000 });
  // Expiration de la session de A, puis connexion de B dans la même page (annonce de session, sans rechargement du document).
  await a.page.evaluate(() => {
    const c = new BroadcastChannel("orasso-session");
    c.postMessage({ userId: null });
    c.postMessage({ userId: "autre-compte" });
    c.close();
  });
  await expect(block).not.toContainText("Canet-en-Roussillon", { timeout: 10_000 });
  await expect(block).toContainText("Perpignan · ta ville");
  await expect(block.getByTestId("my-weather-use-position")).toBeVisible();
  // Rien de la position de A ne repart à l'API après le changement de session.
  const before = requests.filter((r) => r.url.includes("/api/weather/at")).length;
  await a.page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await a.page.waitForTimeout(1000);
  expect(requests.filter((r) => r.url.includes("/api/weather/at")).length).toBe(before);
  await a.ctx.close();
});

test("tour 2 : sans département, position puis « Second lieu » : la ville s'affiche à côté, la position n'est pas enregistrée", async ({
  browser,
}) => {
  const cookie26 = await login("pilote26@orasso.local");
  await apiCall(cookie26, "PUT", "/me/weather/places", { places: [] });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: GEO,
    permissions: ["geolocation"],
  });
  const page = await ctx.newPage();
  await loginInBrowser(page, "pilote26@orasso.local", undefined, "/app");
  await page.goto("/app");
  await page.waitForLoadState("networkidle");
  const block = page.getByTestId("widget-weather");
  await block.getByTestId("my-weather-choose").click();
  await page.waitForURL(/\/app\/meteo/);
  await page.getByTestId("meteo-change").click();
  await page.getByTestId("my-weather-use-position").click();
  await expect(page.getByText("Canet-en-Roussillon · ma position")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("meteo-second").click();
  await page.getByTestId("place-search").fill("Lyon");
  await page.getByTestId("place-search-submit").click();
  await page.getByTestId("place-result-0").click();
  await page.waitForURL(/\/app\/meteo$/);
  await page.goto("/app");
  const saved = await apiCall<{ places: { label: string }[] }>(cookie26, "GET", "/me/weather/places");
  expect(saved.data.places.map((p) => p.label)).toEqual(["Lyon"]);
  await expect(page.getByTestId("widget-weather").getByTestId("my-weather-card-0")).toBeVisible();
  await apiCall(cookie26, "PUT", "/me/weather/places", { places: [] });
  await ctx.close();
});

test("tour 2 : /app/fil puis l'Accueil sans recharger : « Utiliser ma position » marche", async ({ browser }) => {
  const { ctx, page } = await openHome(browser, { geo: true });
  await page.goto("/app/fil");
  await page.waitForLoadState("networkidle");
  // Navigation sans rechargement du document vers l'Accueil.
  await page.evaluate(() => {
    const a = document.querySelector('a[href="/app"]') as HTMLAnchorElement | null;
    a?.click();
  });
  await page.waitForURL(/\/app$/);
  const block = await weatherBlock(page, "Perpignan · ta ville");
  await block.getByTestId("my-weather-use-position").click();
  await expect(block).toContainText("Canet-en-Roussillon · ma position", { timeout: 20_000 });
  await ctx.close();
});

test("tour 3 : position + Lyon, puis remplacer la position par Toulouse : Lyon reste, la position est oubliée après l'enregistrement", async ({
  browser,
}) => {
  const cookie26 = await login("pilote26@orasso.local");
  await apiCall(cookie26, "PUT", "/me/weather/places", { places: [] });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: GEO,
    permissions: ["geolocation"],
  });
  const page = await ctx.newPage();
  await loginInBrowser(page, "pilote26@orasso.local", undefined, "/app");
  await page.goto("/app");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("widget-weather").getByTestId("my-weather-choose").click();
  await page.waitForURL(/\/app\/meteo/);
  await page.getByTestId("meteo-change").click();
  await page.getByTestId("my-weather-use-position").click();
  await expect(page.getByText("Canet-en-Roussillon · ma position")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("meteo-second").click();
  await page.getByTestId("place-search").fill("Lyon");
  await page.getByTestId("place-search-submit").click();
  await page.getByTestId("place-result-0").click();
  await page.waitForURL(/\/app\/meteo$/);
  // La position est toujours la première carte, Lyon la seconde.
  await page.getByTestId("meteo-change").click();
  await page.getByTestId("place-search").fill("Toulouse");
  await page.getByTestId("place-search-submit").click();
  await page.getByTestId("place-result-0").click();
  await page.waitForURL(/\/app\/meteo(\?remplace=position)?$/);
  const saved = await apiCall<{ places: { label: string }[] }>(cookie26, "GET", "/me/weather/places");
  expect(saved.data.places.map((p) => p.label)).toEqual(["Toulouse", "Lyon"]);
  await expect(page.getByText("Canet-en-Roussillon · ma position")).toHaveCount(0);
  await apiCall(cookie26, "PUT", "/me/weather/places", { places: [] });
  await ctx.close();
});
