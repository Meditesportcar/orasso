import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, type Request, test } from "@playwright/test";
import pg from "pg";
import { apiCall, login, loginInBrowser } from "./helpers";
import { RELAIS } from "./relais";

// Petit lot de fin, partie F, côté site : « Pratique » suit la zone de la carte (option C « Hybride »). À 1280 px, la liste et la carte
// côte à côte (pas de bascule) ; à 390 px, la bascule « Liste | Carte ». Filtre local dans ce qui est chargé, bouton « Rechercher dans
// cette zone » au-delà, champ « Ville, lieu ou enseigne », regroupement, feuille « 2 lieux ici », hors ligne. L'API tourne sur les faux
// services locaux de `.run-fin-f/stub.mjs`. Compte : Pilote_103 (66, aucune sortie).
test.use({ actionTimeout: 30_000 });
test.describe.configure({ mode: "serial" });

const EMAIL = "pilote103@orasso.local";
const STUB = `http://127.0.0.1:${process.env.METEO_STUB_PORT ?? 4748}`;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-fin-f-captures/apres`;
const SHOTS = Boolean(process.env.CAPTURES);
if (SHOTS) mkdirSync(DIR, { recursive: true });

async function clearPlacesCache() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("delete from external_cache where key ~ '^(osm|fuel2|wash|fuel):'");
  await client.end();
}

const cookies: Record<string, string> = {};
test.beforeAll(async () => {
  await clearPlacesCache();
  cookies[EMAIL] = await login(EMAIL);
  await apiCall(cookies[EMAIL] ?? null, "PUT", "/me/weather/places", { places: [] });
  const up = await fetch(`${STUB}/__stub?down=0&slow=0&reset=1`).catch(() => null);
  expect(up?.ok, "les faux services locaux doivent tourner (.run-fin-f/stub.mjs)").toBe(true);
});
test.afterAll(async () => {
  await apiCall(cookies[EMAIL] ?? null, "PUT", "/me/weather/places", { places: [] });
  await fetch(`${STUB}/__stub?down=0&slow=0`).catch(() => null);
});

async function open(browser: Browser, opts: { width?: number; theme?: string } = {}) {
  const { width = 1280, theme = "beton" } = opts;
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
  await ctx.route(/(openfreemap|openstreetmap)\.org/, (route) => route.abort());
  await ctx.addInitScript((t) => localStorage.setItem("orasso.theme", t), theme);
  const page = await ctx.newPage();
  const zone: Record<string, unknown>[] = [];
  let all = 0;
  page.on("request", (r: Request) => {
    if (r.method() === "POST" && /\/api\/practical$/.test(r.url())) {
      all += 1;
      const body = JSON.parse(r.postData() ?? "{}") as Record<string, unknown>;
      if (body.near === "zone") zone.push(body);
    }
  });
  await loginInBrowser(page, EMAIL, undefined, "/app");
  return { ctx, page, zoneCalls: () => zone, allCalls: () => all };
}

const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${DIR}/${name}.png` });
};

async function openPage(page: Page, width: number) {
  await page.goto("/app/pratique");
  await expect(page.getByTestId("practical-list")).toBeVisible({ timeout: 30_000 });
  if (width < 900) {
    await page.getByTestId("map-toggle").click();
  }
  await expect(page.getByTestId("practical-map-canvas")).toBeVisible();
  await expect(page.getByTestId("practical-count")).toContainText("dans la zone", { timeout: 30_000 });
}

/** Glisse la carte vers le sud (le doigt monte) : des gestes dans le tiers haut de la carte, hors de la plaque et de la carte du lieu. */
async function panSouth(page: Page, times: number) {
  const box = await page.getByTestId("practical-map-canvas").boundingBox();
  if (!box) throw new Error("carte absente");
  const x = box.x + box.width / 2;
  for (let i = 0; i < times; i++) {
    await page.mouse.move(x, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(x, box.y + 60, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(350);
  }
}

/** Glisse la carte de 100 px vers la gauche (environ 2 km vers l'est) : un geste voisin. */
async function panEastSlightly(page: Page) {
  const box = await page.getByTestId("practical-map-canvas").boundingBox();
  if (!box) throw new Error("carte absente");
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7 - 100, box.y + box.height * 0.4, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(400);
}

test("1280 px : la liste et la carte côte à côte, sans bascule, le compteur, le champ, la ville", async ({ browser }) => {
  const { ctx, page, zoneCalls } = await open(browser, { width: 1280 });
  await openPage(page, 1280);
  await shot(page, "site-ouverture-beton-1280");
  await expect(page.getByTestId("map-toggle")).toHaveCount(0);
  await expect(page.getByTestId("practical-list")).toBeVisible();
  await expect(page.getByTestId("practical-map-view")).toBeVisible();
  await expect(page.getByTestId("practical-search")).toHaveAttribute("placeholder", "Ville, lieu ou enseigne");
  await expect(page.getByTestId("practical-hint")).toContainText("Autour de Perpignan, ta ville.");
  // La liste est à gauche de la carte.
  const listBox = await page.getByTestId("practical-list").boundingBox();
  const mapBox = await page.getByTestId("practical-map-canvas").boundingBox();
  if (!listBox || !mapBox) throw new Error("boîtes absentes");
  expect(listBox.x + listBox.width).toBeLessThanOrEqual(mapBox.x + 2);
  expect(mapBox.width).toBeGreaterThan(380);
  // Le compteur de la plaque et celui de la liste disent la même chose : un seul compteur identifié (la plaque).
  await expect(page.getByTestId("practical-count")).toHaveCount(1);
  // Dans les 30 km chargés : aucun bouton, aucun appel de zone.
  await expect(page.getByTestId("practical-search-here")).toHaveCount(0);
  expect(zoneCalls()).toHaveLength(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await shot(page, "site-ouverture-beton-1280");
  await ctx.close();
});

test("1280 px : hors du chargé, le bouton, un seul appel (zone arrondie au 0,1°), puis les gestes voisins restent locaux", async ({ browser }) => {
  const { ctx, page, zoneCalls } = await open(browser, { width: 1280 });
  await clearPlacesCache();
  await fetch(`${STUB}/__stub?reset=1`);
  await openPage(page, 1280);
  await panSouth(page, 6);
  const button = page.getByTestId("practical-search-here");
  await expect(button).toBeVisible({ timeout: 10_000 });
  await expect(button).toContainText("Rechercher dans cette zone");
  expect(zoneCalls()).toHaveLength(0);
  await shot(page, "site-deplacee-beton-1280");
  await button.click();
  await expect(button).toHaveCount(0, { timeout: 30_000 });
  expect(zoneCalls()).toHaveLength(1);
  const body = zoneCalls()[0] as Record<string, number | string>;
  expect(Object.keys(body).sort()).toEqual(["east", "near", "north", "south", "west"]);
  for (const k of ["south", "west", "north", "east"]) {
    const v = Number(body[k]);
    expect(Math.abs(v * 10 - Math.round(v * 10))).toBeLessThan(1e-9);
  }
  const seen = (await (await fetch(`${STUB}/__stub`)).json()) as { received: { department: string }[] };
  expect(seen.received.length).toBeGreaterThan(0);
  for (const c of seen.received) expect(c.department).toMatch(/^[0-9][0-9AB]$/);
  await shot(page, "site-chargee-beton-1280");
  // Un geste voisin (2 km), dans la zone élargie : plus de bouton, plus d'appel.
  await panEastSlightly(page);
  await expect(page.getByTestId("practical-search-here")).toHaveCount(0);
  expect(zoneCalls()).toHaveLength(1);
  await ctx.close();
});

test("1280 px : la pastille « 2 » ouvre la feuille « 2 lieux ici »", async ({ browser }) => {
  const { ctx, page } = await open(browser, { width: 1280 });
  await openPage(page, 1280);
  const groups = page.getByTestId("practical-group");
  const sheet = page.getByTestId("practical-group-sheet");
  await expect(groups.first()).toBeVisible({ timeout: 15_000 });
  for (let i = 0; i < 5 && !(await sheet.isVisible().catch(() => false)); i++) {
    if (!(await groups.count())) break;
    const two = groups.filter({ hasText: /^2$/ }).first();
    await ((await two.count()) ? two : groups.first()).click();
    await page.waitForTimeout(1_000);
  }
  await expect(sheet).toContainText("2 lieux ici");
  await expect(sheet).toContainText("Même adresse :");
  await expect(page.getByTestId("practical-group-row-1")).toBeVisible();
  await shot(page, "site-groupe-beton-1280");
  await sheet.getByRole("button", { name: "Fermer" }).click();
  await expect(sheet).toHaveCount(0);
  await ctx.close();
});

test("390 px : bascule Liste | Carte, ville cherchée, enseigne, aucun résultat", async ({ browser }) => {
  const { ctx, page, zoneCalls, allCalls } = await open(browser, { width: 390, theme: "sable" });
  await openPage(page, 390);
  const before = allCalls();
  const search = page.getByTestId("practical-search");
  await search.fill("a");
  await expect(page.getByTestId("practical-suggest")).toContainText("Tape au moins deux lettres");
  await search.fill("argel");
  await expect(page.getByTestId("practical-suggest-city-0")).toContainText("Argelès-sur-Mer (66)", { timeout: 15_000 });
  await shot(page, "site-recherche-sable-390");
  await page.getByTestId("practical-suggest-city-0").click();
  await expect(page.getByTestId("practical-hint")).toContainText("Autour d'Argelès-sur-Mer, la ville cherchée.");
  expect(zoneCalls()).toHaveLength(0);
  await shot(page, "site-ville-sable-390");
  await page.getByTestId("practical-search-clear").click();
  await expect(page.getByTestId("practical-hint")).toContainText("Autour de Perpignan, ta ville.");
  await search.fill("laveuse");
  await expect(page.getByTestId("practical-apply-text")).toContainText("Voir le lieu « laveuse »");
  await page.getByTestId("practical-apply-text").click();
  await expect(page.getByTestId("practical-count")).toContainText("1 lavage « laveuse » dans la zone", { timeout: 15_000 });
  expect(allCalls()).toBe(before);
  await shot(page, "site-enseigne-sable-390");
  await page.getByTestId("practical-search-clear").click();
  await search.fill("pneus");
  const empty = page.getByTestId("practical-suggest-empty");
  await expect(empty).toContainText("Aucun résultat. Essaie un autre mot.");
  await expect(empty).toContainText("Les stations-service se cherchent par leur rue");
  await shot(page, "site-aucun-sable-390");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await ctx.close();
});

test("1280 px : hors ligne, le filtre local marche, « Réessayer » et la phrase hors ligne, aucune boucle", async ({ browser }) => {
  const { ctx, page, zoneCalls } = await open(browser, { width: 1280 });
  await openPage(page, 1280);
  await ctx.setOffline(true);
  await panSouth(page, 6);
  await page.getByTestId("practical-filter-wash").click();
  await expect(page.getByTestId("practical-count")).toContainText(/lavages? dans la zone|Aucun lieu dans la zone/);
  await page.getByTestId("practical-filter-all").click();
  const button = page.getByTestId("practical-search-here");
  await expect(button).toBeVisible({ timeout: 10_000 });
  await button.click();
  await expect(page.getByText("Hors ligne : voici la dernière réponse.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("practical-retry")).toBeVisible();
  await expect(page.getByTestId("practical-search-here")).toContainText("Réessayer");
  await shot(page, "site-hors-ligne-beton-1280");
  const n = zoneCalls().length;
  await page.waitForTimeout(4_000);
  expect(zoneCalls().length).toBe(n);
  await ctx.setOffline(false);
  await page.getByTestId("practical-retry").click();
  await expect(page.getByTestId("practical-retry")).toHaveCount(0, { timeout: 30_000 });
  await ctx.close();
});

test("1280 px : trop dézoomée, « Zoome sur un secteur pour voir ses lieux. », aucun appel ; champ loading : le O vivant puis la zone", async ({ browser }) => {
  const { ctx, page, zoneCalls } = await open(browser, { width: 1280, theme: "sable" });
  await openPage(page, 1280);
  const box = await page.getByTestId("practical-map-canvas").boundingBox();
  if (!box) throw new Error("carte absente");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(200);
  }
  await expect(page.getByTestId("practical-zoom-note")).toContainText("Zoome sur un secteur pour voir ses lieux.", { timeout: 15_000 });
  await expect(page.getByTestId("practical-search-here")).toHaveCount(0);
  expect(zoneCalls()).toHaveLength(0);
  await shot(page, "site-dezoom-sable-1280");
  // Toulouse : un département jamais lu ; le faux service met 6 s à répondre : l'API répond partielle avec `loading`.
  await fetch(`${STUB}/__stub?slow=6000`);
  await page.getByTestId("practical-search").fill("toul");
  await page.getByTestId("practical-suggest-city-0").click();
  const button = page.getByTestId("practical-search-here");
  await expect(button).toContainText("Recherche des lieux de la zone", { timeout: 15_000 });
  await expect(button).toBeDisabled();
  await shot(page, "site-chargement-sable-1280");
  await fetch(`${STUB}/__stub?slow=0`);
  await expect(page.getByTestId("practical-search-here")).toHaveCount(0, { timeout: 60_000 });
  expect(zoneCalls().length).toBeGreaterThanOrEqual(2);
  await ctx.close();
});
