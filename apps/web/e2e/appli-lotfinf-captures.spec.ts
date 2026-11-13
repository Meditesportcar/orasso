import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, type Request, test } from "@playwright/test";
import pg from "pg";
import { apiCall, login, SEED_PASSWORD } from "./helpers";
import { RELAIS } from "./relais";

// Petit lot de fin, partie F : matrice de captures de « Pratique » (Béton et Sable, 384 et 390 px, police ×1 et ×1,3), à lancer avec
// CAPTURES=1 et APP_URL (jamais dans la suite courante). Les noms : appli-<état>-<thème>-<largeur>[-x13].
const APP = process.env.APP_URL;
test.skip(!APP || !process.env.CAPTURES, "Captures : lancer avec APP_URL et CAPTURES=1");
test.use({ actionTimeout: 30_000 });
test.describe.configure({ mode: "serial" });

const EMAIL = "pilote103@orasso.local";
const STUB = `http://127.0.0.1:${process.env.METEO_STUB_PORT ?? 4748}`;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-fin-f-captures/apres`;
const SHOTS = Boolean(process.env.CAPTURES);
if (SHOTS) mkdirSync(DIR, { recursive: true });
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
  opts: { scale?: number; theme?: string; width?: number; geo?: boolean } = {},
): Promise<{
  page: Page;
  ctx: Awaited<ReturnType<Browser["newContext"]>>;
  zoneCalls: () => Record<string, unknown>[];
  allCalls: () => number;
}> {
  const { scale = 1, theme = "beton", width = 384, geo = false } = opts;
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    baseURL: APP,
    ...(geo ? { geolocation: GEO, permissions: ["geolocation"] } : {}),
  });
  await ctx.route(/(openfreemap|openstreetmap)\.org/, (route) => route.abort());
  await ctx.addInitScript(
    ([t, s]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", String(t));
      if (Number(s) > 1) localStorage.setItem("orasso.recette.echellePolice", String(s));
    },
    [theme, scale],
  );
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
  return { ctx, page, zoneCalls: () => zone, allCalls: () => all };
}

const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${DIR}/${name}.png` });
};

/** L'écran « Pratique », sur la carte ; attend la plaque du compteur. */
async function openMap(page: Page) {
  await page.goto("/pratique");
  await expect(page.getByTestId("practical-list")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("map-toggle").click();
  await expect(page.getByTestId("practical-map-canvas")).toBeVisible();
  await expect(page.getByTestId("practical-count")).toContainText("dans la zone", { timeout: 30_000 });
}

/** Glisse la carte vers le sud (le doigt monte). */
async function panSouth(page: Page, times: number) {
  const box = await page.getByTestId("practical-map-canvas").boundingBox();
  if (!box) throw new Error("carte absente");
  const x = box.x + box.width / 2;
  for (let i = 0; i < times; i++) {
    // Le geste part au-dessus de la carte du lieu (en bas) et sous la plaque du compteur (en haut) : au plus 180 px, environ 4 km.
    await page.mouse.move(x, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(x, box.y + 50, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(350);
  }
}

const cookies: Record<string, string> = {};
/** Vide le cache des sources de lieux : les lectures passent par le faux service (le seed y avait déposé d'autres lieux). */
async function clearPlacesCache() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("delete from external_cache where key ~ '^(osm|fuel2|wash|fuel):'");
  await client.end();
}

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

const COMBOS: { theme: string; width: number; scale: number }[] = [
  { theme: "sable", width: 384, scale: 1 },
  { theme: "beton", width: 390, scale: 1 },
  { theme: "sable", width: 390, scale: 1 },
  { theme: "beton", width: 384, scale: 1.3 },
  { theme: "sable", width: 390, scale: 1.3 },
];

for (const { theme, width, scale } of COMBOS) {
  test(`captures ${theme} ${width} ×${scale}`, async ({ browser }) => {
    const tag = `${theme}-${width}${scale > 1 ? "-x13" : ""}`;
    await clearPlacesCache();
    await fetch(`${STUB}/__stub?reset=1`);
    const { ctx, page } = await open(browser, { theme, width, scale });
    await page.goto("/pratique");
    await expect(page.getByTestId("practical-list")).toBeVisible({ timeout: 30_000 });
    await shot(page, `appli-liste-${tag}`);
    await page.getByTestId("map-toggle").click();
    await expect(page.getByTestId("practical-count")).toContainText("dans la zone", { timeout: 30_000 });
    await page.waitForTimeout(800);
    await shot(page, `appli-ouverture-${tag}`);
    // Le groupe « 2 lieux ici ».
    const groups = page.getByTestId("practical-group");
    const title = page.getByTestId("practical-group-title");
    for (let i = 0; i < 5 && !(await title.isVisible().catch(() => false)); i++) {
      if (!(await groups.count())) break;
      const two = groups.filter({ hasText: /^2$/ }).first();
      await ((await two.count()) ? two : groups.first()).click();
      await page.waitForTimeout(1_000);
    }
    if (await title.isVisible().catch(() => false)) {
      await shot(page, `appli-groupe-${tag}`);
      await page.getByRole("button", { name: "Fermer" }).last().click();
    }
    // Recherche : propositions, ville, enseigne, aucun résultat.
    const search = page.getByTestId("practical-search");
    await search.fill("argel");
    await expect(page.getByTestId("practical-suggest-city-0")).toBeVisible({ timeout: 15_000 });
    await shot(page, `appli-recherche-${tag}`);
    await page.getByTestId("practical-suggest-city-0").click();
    await expect(page.getByTestId("practical-hint")).toContainText("la ville cherchée");
    await page.waitForTimeout(800);
    await shot(page, `appli-ville-${tag}`);
    await page.getByTestId("practical-search-clear").click();
    await search.fill("laveuse");
    await expect(page.getByTestId("practical-apply-text")).toBeVisible({ timeout: 15_000 });
    await shot(page, `appli-enseigne-${tag}`);
    await page.getByTestId("practical-apply-text").click();
    await page.waitForTimeout(1_200);
    await shot(page, `appli-filtre-${tag}`);
    await page.getByTestId("practical-search-clear").click();
    await search.fill("pneus");
    await expect(page.getByTestId("practical-suggest-empty")).toBeVisible({ timeout: 15_000 });
    await shot(page, `appli-aucun-${tag}`);
    await page.getByTestId("practical-search-clear").click();
    // Retour sur Perpignan (« Recentrer »), puis carte déplacée : le bouton, puis la zone chargée.
    if (await page.getByTestId("practical-recenter").isVisible().catch(() => false)) {
      await page.getByTestId("practical-recenter").click();
      await page.waitForTimeout(1_200);
    }
    await panSouth(page, scale > 1 ? 14 : 9);
    await expect(page.getByTestId("practical-search-here")).toBeVisible({ timeout: 10_000 });
    await shot(page, `appli-deplacee-${tag}`);
    await page.getByTestId("practical-search-here").click();
    await expect(page.getByTestId("practical-search-here")).toHaveCount(0, { timeout: 30_000 });
    await page.waitForTimeout(600);
    await shot(page, `appli-chargee-${tag}`);
    // Trop dézoomée.
    const box = await page.getByTestId("practical-map-canvas").boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let i = 0; i < 6; i++) {
        await page.mouse.wheel(0, 400);
        await page.waitForTimeout(200);
      }
      await expect(page.getByTestId("practical-zoom-note")).toBeVisible({ timeout: 15_000 });
      await shot(page, `appli-dezoom-${tag}`);
    }
    await ctx.close();
  });
}
