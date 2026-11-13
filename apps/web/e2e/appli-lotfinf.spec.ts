import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, type Request, test } from "@playwright/test";
import pg from "pg";
import { apiCall, login, SEED_PASSWORD } from "./helpers";
import { RELAIS } from "./relais";

// Petit lot de fin, partie F, côté appli (version web compilée de recette) : « Pratique » suit la zone de la carte (option C « Hybride »).
// Filtre local dans ce qui est chargé (aucun appel), bouton « Rechercher dans cette zone » au-delà, zone demandée arrondie au 0,1° et
// élargie, champ « Ville, lieu ou enseigne » (ville : `GET /geo/cities`, enseigne : filtre sur le téléphone), regroupement, feuille
// « 2 lieux ici », hors ligne, champ `loading`. La position exacte ne part jamais.
// Lancer avec APP_URL, l'API sur les faux services locaux (`OVERPASS_URL`, `FUEL_API_URL`, `GEOCODER_URL` sur le port de
// `METEO_STUB_PORT`) : le stub du lot est `.run-fin-f/stub.mjs`. Compte : Pilote_103 (66, aucune sortie).
const APP = process.env.APP_URL;
test.skip(!APP, "Appli : lancer avec APP_URL");
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
    // Le doigt reste posé un instant avant de se lever : pas d'élan, la carte s'arrête où on la lâche.
    await page.waitForTimeout(300);
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

test("ouverture : la liste et le compteur disent la zone (8 km), la ville, aucun appel de zone", async ({
  browser,
}) => {
  const { ctx, page, zoneCalls } = await open(browser);
  await page.goto("/pratique");
  await expect(page.getByTestId("practical-list")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("practical-count")).toContainText(
    /\d+ stations? · \d+ lavages? dans la zone|\d+ stations? dans la zone|\d+ lavages? dans la zone/,
  );
  await expect(page.getByTestId("practical-hint")).toContainText("Autour de Perpignan, ta ville.");
  await expect(page.getByTestId("practical-search")).toHaveAttribute("placeholder", "Ville, lieu ou enseigne");
  await expect(page.getByTestId("practical-row-0")).toBeVisible();
  // Dans les 30 km chargés : pas de bouton, aucun appel de zone.
  await expect(page.getByTestId("practical-search-here")).toHaveCount(0);
  expect(zoneCalls()).toHaveLength(0);
  await shot(page, "appli-ouverture-liste-beton-384");
  await ctx.close();
});

test("carte : regroupement, feuille « 2 lieux ici », filtre local sans réseau", async ({ browser }) => {
  const { ctx, page, allCalls } = await open(browser);
  await openMap(page);
  const before = allCalls();
  // Une station et un lavage à la même adresse : une pastille « 2 », la feuille liste les deux lieux.
  // Au zoom d'ouverture la pastille est plus large (elle regroupe aussi des lieux voisins) : la toucher rapproche la carte jusqu'à les
  // séparer ; la pastille « 2 » restante est la paire à la même adresse, qui ouvre la feuille.
  const groups = page.getByTestId("practical-group");
  await expect(groups.first()).toBeVisible({ timeout: 15_000 });
  // La plaque du compteur tient sur une ligne à 384 px (maquette).
  expect((await page.getByTestId("practical-count").boundingBox())?.height ?? 99).toBeLessThan(26);
  await shot(page, "appli-ouverture-carte-beton-384");
  const title = page.getByTestId("practical-group-title");
  for (let i = 0; i < 5 && !(await title.isVisible().catch(() => false)); i++) {
    const two = groups.filter({ hasText: /^2$/ }).first();
    if (!(await groups.count())) break;
    await ((await two.count()) ? two : groups.first()).click();
    await page.waitForTimeout(1_000);
  }
  await expect(title).toHaveText("2 lieux ici");
  await expect(page.getByTestId("practical-group-row-1")).toBeVisible();
  await shot(page, "appli-groupe-beton-384");
  await page.getByRole("button", { name: "Fermer" }).last().click();
  await expect(page.getByTestId("practical-group-title")).toHaveCount(0);
  // Le filtre « Lavage » change le compteur sans aucun appel.
  const countAll = await page.getByTestId("practical-count").innerText();
  await page.getByRole("tab", { name: "Lavage" }).click();
  await expect(page.getByTestId("practical-count")).not.toHaveText(countAll);
  await expect(page.getByTestId("practical-count")).toContainText(/lavages? dans la zone/);
  expect(allCalls()).toBe(before);
  await ctx.close();
});

test("hors du chargé : le bouton, un seul appel, la zone arrondie au 0,1° et élargie, aucune position", async ({
  browser,
}) => {
  const { ctx, page, zoneCalls } = await open(browser, { geo: true });
  // Les sources sont relues depuis le faux service : leurs appels sont comptés depuis ici.
  await clearPlacesCache();
  await fetch(`${STUB}/__stub?reset=1`);
  await openMap(page);
  await panSouth(page, 11);
  const button = page.getByTestId("practical-search-here");
  await expect(button).toBeVisible({ timeout: 10_000 });
  await expect(button).toContainText("Rechercher dans cette zone");
  await expect(page.getByTestId("practical-hint")).toContainText(/Autour (de|du|des|d').+, la zone de la carte\./);
  // Jamais de rechargement surprise : rien n'est parti avant l'appui.
  expect(zoneCalls()).toHaveLength(0);
  // Le bouton est asphalte dans les deux thèmes (jeton `bar`), jamais crème.
  const lum = await button.evaluate((el) => {
    // Le bouton, ou le plus proche parent qui porte un fond (react-native-web pose le fond sur un élément voisin).
    let node: Element | null = el;
    let m: RegExpExecArray | null = null;
    while (node && !m) {
      m = /rgb\((\d+), (\d+), (\d+)\)/.exec(getComputedStyle(node).backgroundColor);
      node = node.parentElement;
    }
    return m ? (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3 : 255;
  });
  expect(lum).toBeLessThan(60);
  await shot(page, "appli-deplacee-beton-384");
  await button.click();
  await expect(button).toHaveCount(0, { timeout: 30_000 });
  expect(zoneCalls()).toHaveLength(1);
  const body = zoneCalls()[0] as { south: number; west: number; north: number; east: number };
  for (const v of [body.south, body.west, body.north, body.east])
    expect(Math.abs(v * 10 - Math.round(v * 10))).toBeLessThan(1e-9);
  expect(body.north - body.south).toBeGreaterThan(0.1);
  expect(Object.keys(body).sort()).toEqual(["east", "near", "north", "south", "west"]);
  const sent = JSON.stringify(body);
  for (const needle of ["42.704937", "2.895412", "42.7049", "2.8954"]) expect(sent).not.toContain(needle);
  // Les sources ne voient que des codes de département.
  const seen = await stub();
  expect(seen.received.length).toBeGreaterThan(0);
  for (const c of seen.received) expect(c.department).toMatch(/^[0-9][0-9AB]$/);
  await shot(page, "appli-chargee-beton-384");
  // Un geste voisin, dans la zone élargie : plus de bouton, plus d'appel.
  await panSouth(page, 1);
  await expect(page.getByTestId("practical-search-here")).toHaveCount(0);
  expect(zoneCalls()).toHaveLength(1);
  await ctx.close();
});

test("ville cherchée : recentre, « Autour d'… la ville cherchée », distances depuis la ville, ✕ revient", async ({
  browser,
}) => {
  const { ctx, page, zoneCalls } = await open(browser);
  await openMap(page);
  const search = page.getByTestId("practical-search");
  await search.fill("a");
  await expect(page.getByTestId("practical-suggest")).toContainText("Tape au moins deux lettres");
  await search.fill("argel");
  const city = page.getByTestId("practical-suggest-city-0");
  await expect(city).toContainText("Argelès-sur-Mer (66)", { timeout: 15_000 });
  await expect(page.getByTestId("practical-suggest")).toContainText("Villes et lieux");
  await shot(page, "appli-recherche-beton-384");
  await city.click();
  await expect(page.getByTestId("practical-hint")).toContainText("Autour d'Argelès-sur-Mer, la ville cherchée.");
  await expect(page.getByTestId("practical-searched")).toBeVisible();
  // Argelès est dans les 30 km chargés : aucun appel de zone.
  expect(zoneCalls()).toHaveLength(0);
  await shot(page, "appli-ville-beton-384");
  await page.getByTestId("practical-search-clear").click();
  await expect(page.getByTestId("practical-hint")).toContainText("Autour de Perpignan, ta ville.");
  await ctx.close();
});

test("ville hors du chargé : la zone est lue tout de suite, une seule fois", async ({ browser }) => {
  const { ctx, page, zoneCalls } = await open(browser);
  await openMap(page);
  const search = page.getByTestId("practical-search");
  await search.fill("banyu");
  await page.getByTestId("practical-suggest-city-0").click();
  await expect(page.getByTestId("practical-hint")).toContainText("Autour de Banyuls-sur-Mer, la ville cherchée.", {
    timeout: 30_000,
  });
  await expect.poll(() => zoneCalls().length, { timeout: 30_000 }).toBe(1);
  await expect(page.getByTestId("practical-search-here")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("practical-count")).toContainText("dans la zone");
  await ctx.close();
});

test("enseigne : « La Laveuse » filtre les lieux chargés sur le téléphone, sans appel", async ({ browser }) => {
  const { ctx, page, allCalls } = await open(browser);
  await openMap(page);
  const before = allCalls();
  const search = page.getByTestId("practical-search");
  await search.fill("laveuse");
  await expect(page.getByTestId("practical-suggest")).toContainText("Dans la zone");
  const apply = page.getByTestId("practical-apply-text");
  await expect(apply).toContainText("Voir le lieu « laveuse »");
  await shot(page, "appli-enseigne-beton-384");
  await apply.click();
  await expect(page.getByTestId("practical-count")).toContainText("1 lavage « laveuse » dans la zone", {
    timeout: 15_000,
  });
  expect(allCalls()).toBe(before);
  await shot(page, "appli-filtre-beton-384");
  await ctx.close();
});

test("aucun résultat : la phrase qui explique qu'une station se trouve par sa rue", async ({ browser }) => {
  const { ctx, page } = await open(browser);
  await openMap(page);
  await page.getByTestId("practical-search").fill("pneus");
  const empty = page.getByTestId("practical-suggest-empty");
  await expect(empty).toContainText("Aucun résultat. Essaie un autre mot.", { timeout: 15_000 });
  await expect(empty).toContainText(
    "Les stations-service se cherchent par leur rue : les données publiques ne donnent pas leur enseigne.",
  );
  await shot(page, "appli-aucun-beton-384");
  await ctx.close();
});

test("trop dézoomée : « Zoome sur un secteur pour voir ses lieux. », aucun appel", async ({ browser }) => {
  const { ctx, page, zoneCalls } = await open(browser);
  await openMap(page);
  const box = await page.getByTestId("practical-map-canvas").boundingBox();
  if (!box) throw new Error("carte absente");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(200);
  }
  await expect(page.getByTestId("practical-zoom-note")).toContainText("Zoome sur un secteur pour voir ses lieux.", {
    timeout: 15_000,
  });
  await expect(page.getByTestId("practical-search-here")).toHaveCount(0);
  expect(zoneCalls()).toHaveLength(0);
  await shot(page, "appli-dezoom-beton-384");
  await ctx.close();
});

test("hors ligne : le filtre local marche, le bouton dit « Réessayer » avec la phrase hors ligne, la reprise relit", async ({
  browser,
}) => {
  const { ctx, page, zoneCalls } = await open(browser);
  await openMap(page);
  await ctx.setOffline(true);
  await panSouth(page, 11);
  // Le filtre « Lavage » marche sans réseau.
  await page.getByRole("tab", { name: "Lavage" }).click();
  await expect(page.getByTestId("practical-count")).toContainText(/lavages? dans la zone|Aucun lieu dans la zone/);
  await page.getByRole("tab", { name: "Tout" }).click();
  const button = page.getByTestId("practical-search-here");
  await expect(button).toBeVisible({ timeout: 10_000 });
  await button.click();
  await expect(page.getByText("Hors ligne : voici ce que ton téléphone a gardé.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("practical-retry")).toBeVisible();
  await expect(page.getByTestId("practical-search-here")).toContainText("Réessayer");
  await expect(page.getByTestId("practical-offline-note")).toContainText(
    "Il faut du réseau pour chercher dans cette zone.",
  );
  await shot(page, "appli-hors-ligne-beton-384");
  // Aucune boucle : rien ne repart seul.
  const n = zoneCalls().length;
  await page.waitForTimeout(4_000);
  expect(zoneCalls().length).toBe(n);
  await ctx.setOffline(false);
  // « Réessayer » après un déplacement : la zone regardée, pas l'ancienne (un seul appui).
  await panSouth(page, 8);
  await expect(page.getByTestId("practical-retry")).toHaveCount(0);
  await expect(page.getByTestId("practical-search-here")).toContainText("Rechercher dans cette zone");
  await page.getByTestId("practical-search-here").click();
  await expect(page.getByTestId("practical-search-here")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("practical-retry")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("practical-search-here")).toHaveCount(0, { timeout: 30_000 });
  await ctx.close();
});

test("champ loading : le O vivant pendant la lecture, relecture espacée, puis la zone chargée", async ({ browser }) => {
  const { ctx, page, zoneCalls } = await open(browser);
  await openMap(page);
  // Toulouse : un département jamais lu ; le faux service met 6 s à répondre, l'API répond partielle avec `loading` au bout de 2,5 s.
  await fetch(`${STUB}/__stub?slow=6000`);
  await page.getByTestId("practical-search").fill("toul");
  await page.getByTestId("practical-suggest-city-0").click();
  const button = page.getByTestId("practical-search-here");
  await expect(button).toContainText("Recherche des lieux de la zone", { timeout: 15_000 });
  await expect(button).toBeDisabled();
  await shot(page, "appli-chargement-beton-384");
  await fetch(`${STUB}/__stub?slow=0`);
  // La même zone est relue (3 s après), puis le bouton disparaît ; jamais deux lectures à moins de 3 s.
  await expect(page.getByTestId("practical-search-here")).toHaveCount(0, { timeout: 60_000 });
  expect(zoneCalls().length).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId("practical-retry")).toHaveCount(0);
  await ctx.close();
});

test("recherche faite depuis la liste : la carte montée ensuite est cadrée sur la ville cherchée, puis retour à la liste", async ({ browser }) => {
  const { ctx, page } = await open(browser);
  await page.goto("/pratique");
  await expect(page.getByTestId("practical-list")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("practical-search").fill("toul");
  await page.getByTestId("practical-suggest-city-0").click();
  await expect(page.getByTestId("practical-hint")).toContainText("Autour de Toulouse, la ville cherchée.", { timeout: 30_000 });
  await page.getByTestId("map-toggle").click();
  await expect(page.getByTestId("practical-map-canvas")).toBeVisible();
  // La carte est cadrée sur Toulouse : l'épingle de la ville cherchée est dans la vue, et la ligne dit toujours « la ville cherchée ».
  await expect(page.getByTestId("practical-searched")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("practical-hint")).toContainText("Autour de Toulouse, la ville cherchée.");
  await page.getByTestId("list-toggle").click();
  await expect(page.getByTestId("practical-list")).toBeVisible();
  await expect(page.getByTestId("practical-hint")).toContainText("Autour de Toulouse, la ville cherchée.");
  await ctx.close();
});

test("panne de la recherche de villes : un message et « Réessayer », jamais « Aucun résultat » ; la saisie est gardée", async ({ browser }) => {
  const { ctx, page } = await open(browser);
  await openMap(page);
  await ctx.route(//api/geo/cities/, (route) => route.abort());
  const search = page.getByTestId("practical-search");
  await search.fill("argel");
  await expect(page.getByTestId("practical-suggest-failed")).toContainText("La recherche de villes est indisponible pour le moment.", { timeout: 15_000 });
  await expect(page.getByTestId("practical-suggest-empty")).toHaveCount(0);
  await expect(search).toHaveValue("argel");
  await ctx.unroute(//api/geo/cities/);
  await page.getByTestId("practical-suggest-retry").click();
  await expect(page.getByTestId("practical-suggest-city-0")).toContainText("Argelès-sur-Mer (66)", { timeout: 15_000 });
  await expect(page.getByTestId("practical-suggest-failed")).toHaveCount(0);
  await ctx.close();
});

test("police ×1,3 à 384 px, Sable : le champ, le compteur et le bouton ne se coupent pas, pas de défilement horizontal", async ({
  browser,
}) => {
  const { ctx, page } = await open(browser, { scale: 1.3, theme: "sable" });
  await openMap(page);
  // La police agrandie grossit la carte du lieu et la plaque : des gestes plus nombreux, partant plus haut.
  await panSouth(page, 16);
  await expect(page.getByTestId("practical-search-here")).toBeVisible({ timeout: 10_000 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  const plaque = await page.getByTestId("practical-count").boundingBox();
  const map = await page.getByTestId("practical-map-canvas").boundingBox();
  if (plaque && map) expect(plaque.x + plaque.width).toBeLessThanOrEqual(map.x + map.width + 1);
  await shot(page, "appli-deplacee-sable-384-x13");
  await ctx.close();
});
