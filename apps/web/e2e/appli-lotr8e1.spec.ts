import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD, warmDepartmentWeather } from "./helpers";
import { RELAIS } from "./relais";

const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r8r-captures/apres`;

// Lot R8e1, côté appli (version web compilée de recette) : la météo de l'événement est une ligne de sa carte dans
// « Prochaine sortie » ; absente au-delà de 7 jours ; bandeau quand l'événement est « Incertain » ; masquer « Météo de
// l'événement » (Personnaliser) la retire dès le retour sur l'Accueil ; le bloc « Météo » ne dit que le département.
// Compte : Pilote_005 (Salon Argelès aujourd'hui et Nocturne de Canet à moins de 7 jours, retenu ; Salon de printemps à plus
// de 7 jours ; Expo Rivesaltes en attente). Lancer avec APP_URL, API seedée (WEATHER_PROVIDER=open-meteo et METEO_URL).
const APP = process.env.APP_URL;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

const EMAIL = "pilote5@orasso.local";
// « Mardi : 24°, vent 14 km/h » (espaces insécables possibles avant « km »).
const HEADLINE = /^\p{Lu}\p{L}+ : \d+°, vent \d+\s*km\/h$/u;
const NOCTURNE = "nocturne-de-canet-2026";
const DEFAULT_HIDDEN = ["agenda", "favorite_garage", "pending"];

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, scale = 1, email = EMAIL) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 900 }, baseURL: APP });
  await ctx.addInitScript((s) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", "beton");
    if (s > 1) localStorage.setItem("orasso.recette.echellePolice", String(s));
  }, scale);
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

async function nocturneId(cookie: string) {
  return (await apiCall<{ id: string }>(cookie, "GET", `/events/by-slug/${NOCTURNE}`)).data.id;
}

test.describe.configure({ mode: "serial" });
let cookie: string;
let damien: string;
test.beforeAll(async () => {
  cookie = await login(EMAIL);
  damien = await login("damien@orasso.local");
  await warmDepartmentWeather(cookie); // le stock du département (l'Accueil ne lit que lui)
  // « En cours » (le Lydia) remplacerait les tickets : on le masque, comme le ferait la personne.
  await apiCall(cookie, "PUT", "/me/home/widgets", { order: [], hidden: ["live", ...DEFAULT_HIDDEN] });
  await apiCall(damien, "PATCH", `/events/${await nocturneId(damien)}/outlook`, { outlook: "maintained" });
});
test.afterAll(async () => {
  // Kenji (test « En cours ») retrouve ses réglages d'Accueil par défaut : d'autres recettes comptent sur son garage favori.
  await apiCall(await login("kenji@orasso.local"), "DELETE", "/me/home/widgets");
  await apiCall(cookie, "PUT", "/me/home/widgets", { order: [], hidden: DEFAULT_HIDDEN });
  await apiCall(damien, "PATCH", `/events/${await nocturneId(damien)}/outlook`, { outlook: "maintained" });
});

test("la ligne météo est dans la carte, au-dessus de « Mon accès », seulement pour une sortie à moins de 7 jours", async ({
  browser,
}) => {
  const { ctx, page } = await open(browser);
  await expect(page.getByTestId("home-outing").first()).toBeVisible({ timeout: 30_000 });
  const cards = page.getByTestId("home-outing");
  const total = await cards.count();
  const withLine = page.getByTestId("home-outing-weather");
  // Salon Argelès (aujourd'hui) et Nocturne de Canet (< 7 jours) ont chacun leur ligne.
  expect(total).toBe(2);
  await expect(withLine).toHaveCount(2);
  const first = cards.nth(0);
  await expect(first.getByTestId("home-outing-title")).toContainText(/Salon Argelès/i);
  const line = first.getByTestId("home-outing-weather");
  await expect(line).toBeVisible();
  // Le libellé accessible : « Météo de mardi : ciel dégagé, 17 degrés, vent 25 km/h ».
  await expect(line).toHaveAttribute("aria-label", /^Météo de \p{Ll}+ : .+, \d+ degrés, vent \d+\s*km\/h$/u);
  const text = (await line.innerText()).split("\n");
  expect(text[0]?.trim()).toMatch(HEADLINE);
  // Seconde ligne : le temps puis le fournisseur, sans « Météo : ».
  await expect(first.getByTestId("home-outing-weather-sub")).toContainText(/ · Open-Meteo$/);
  await expect(first.getByTestId("home-outing-weather-sub")).not.toContainText("Météo :");
  // Au-dessus du bouton « Mon accès » (même carte), sous les informations.
  const a = await line.boundingBox();
  const b = await first.getByTestId("home-hero-action").boundingBox();
  const top = await first.getByTestId("home-outing-open").boundingBox();
  expect(a && b && top && a.y + a.height <= b.y + 1 && a.y >= top.y + top.height - 1).toBe(true);
  // Pas d'événement incertain : pas de bandeau.
  await expect(page.getByTestId("home-outing-weather-banner")).toHaveCount(0);
  await ctx.close();
});

test("une sortie à plus de 7 jours (billet) : pas de ligne, la carte ne change pas", async ({ browser }) => {
  const { ctx, page } = await open(browser, 1, "paul.photo@orasso.local");
  await expect(page.getByTestId("home-outing").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("home-outing")).toHaveCount(1);
  await expect(page.getByTestId("home-outing").getByTestId("home-hero-action")).toBeVisible();
  await expect(page.getByTestId("home-outing-weather")).toHaveCount(0);
  await ctx.close();
});

test("événement « Incertain » : seconde ligne « Prévision peu sûre à N jours » et bandeau dans la carte", async ({
  browser,
}) => {
  const id = await nocturneId(damien);
  expect((await apiCall(damien, "PATCH", `/events/${id}/outlook`, { outlook: "uncertain" })).status).toBe(200);
  const { ctx, page } = await open(browser);
  const nocturne = page.getByTestId("home-outing").filter({ hasText: /Nocturne de Canet/i });
  await expect(nocturne).toHaveCount(1, { timeout: 30_000 });
  await expect(nocturne.getByTestId("home-outing-weather-sub")).toHaveText(/^Prévision peu sûre à \d+ jours?$/);
  await expect(nocturne.getByTestId("home-outing-weather-banner")).toHaveText(
    "Météo incertaine : on la revérifie la veille et le matin.",
  );
  // Le Salon Argelès (maintenu) n'a pas de bandeau.
  await expect(page.getByTestId("home-outing-weather-banner")).toHaveCount(1);
  await nocturne.scrollIntoViewIfNeeded();
  await ctx.close();
  await apiCall(damien, "PATCH", `/events/${id}/outlook`, { outlook: "maintained" });
});

test("le bloc « Météo » ne dit que le département ; « Météo de l'événement » masqué retire la ligne dès le retour", async ({
  browser,
}) => {
  const { ctx, page } = await open(browser);
  const block = page.getByTestId("home-weather");
  await expect(block).toBeVisible({ timeout: 30_000 });
  // Lot R8m : « Ma météo » (la ville du département, « Perpignan · ta ville »), plus « Météo du jour » ni « Dép. 66 ».
  await expect(block).toContainText("Ma météo");
  await expect(block).toContainText("Perpignan · ta ville");
  await expect(block).not.toContainText(/jour J/);
  await expect(page.getByTestId("home-outing-weather")).toHaveCount(2);

  await page.getByTestId("home-personalize-bottom").click();
  const row = page.getByTestId("personalize-row-event_weather");
  await expect(row).toContainText("Météo de l'événement", { timeout: 30_000 });
  await expect(row).toContainText("Affiche ou masque la ligne météo de la carte « Prochaine sortie »");
  await page.getByTestId("personalize-hide-event_weather").click();
  await page.getByTestId("personalize-save").click();
  await expect
    .poll(async () => (await apiCall<{ widgets: { hidden: string[] } }>(cookie, "GET", "/me/home")).data.widgets.hidden)
    .toContain("event_weather");
  await page.goto("/accueil");
  await afterOpening(page);
  await expect(page.getByTestId("home-outing").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("home-outing-weather")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("home-weather")).toContainText("Perpignan · ta ville");
  await ctx.close();
  await apiCall(cookie, "PUT", "/me/home/widgets", { order: [], hidden: ["live", ...DEFAULT_HIDDEN] });
});

test("police ×1,3 : la ligne et le bandeau ne coupent aucun mot", async ({ browser }) => {
  const id = await nocturneId(damien);
  await apiCall(damien, "PATCH", `/events/${id}/outlook`, { outlook: "uncertain" });
  const { ctx, page } = await open(browser, 1.3);
  const nocturne = page.getByTestId("home-outing").filter({ hasText: /Nocturne de Canet/i });
  await expect(nocturne.getByTestId("home-outing-weather-banner")).toBeVisible({ timeout: 30_000 });
  // Aucun débordement horizontal de la carte.
  const overflow = await nocturne.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(overflow).toBe(false);
  await ctx.close();
  await apiCall(damien, "PATCH", `/events/${id}/outlook`, { outlook: "maintained" });
});

test("« En cours » porte la météo de son événement, comme sa carte ; Personnaliser : l'œil seul pour la ligne météo", async ({
  browser,
}) => {
  const kenji = await login("kenji@orasso.local");
  await apiCall(kenji, "PUT", "/me/home/widgets", { order: [], hidden: DEFAULT_HIDDEN });
  const { ctx, page } = await open(browser, 1, "kenji@orasso.local");
  const live = page.getByTestId("home-live-line");
  await expect(live).toBeVisible({ timeout: 30_000 });
  const line = live.getByTestId("home-outing-weather");
  await expect(line).toBeVisible();
  expect(((await line.innerText()).split("\n")[0] ?? "").trim()).toMatch(HEADLINE);
  // Lot R8r : « En cours » (le Lydia, plusieurs jours) montre la journée d'aujourd'hui, pas celle du début de l'événement.
  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", timeZone: "Europe/Paris" });
  expect(((await line.innerText()).split("\n")[0] ?? "").trim().toLowerCase()).toMatch(new RegExp(`^${today} :`));
  // Au-dessus des boutons de la ligne.
  const a = await line.boundingBox();
  const b = await live.getByTestId("home-live-sheet").boundingBox();
  expect(a && b && a.y + a.height <= b.y + 1).toBe(true);

  await page.getByTestId("home-personalize-bottom").click();
  await expect(page.getByTestId("personalize-row-event_weather")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("personalize-up-event_weather")).toHaveCount(0);
  await expect(page.getByTestId("personalize-down-event_weather")).toHaveCount(0);
  await expect(page.getByTestId("personalize-hide-event_weather")).toBeVisible();
  // « En cours » est le premier bloc qui bouge : il ne monte plus.
  await expect(page.getByTestId("personalize-up-live")).toBeDisabled();
  await ctx.close();
});

// Lot R8r : premier chargement (le stock du département est vide) : « Météo en cours de chargement », puis une seule relecture
// de l'Accueil quelques secondes plus tard ; la météo arrive sans que l'écran ait été bloqué. La réponse « vide » est simulée
// sur la première lecture seulement (le stock réel est rempli par le bouchon local).
test("lot R8r : stock vide → « Météo en cours de chargement », puis la relecture unique amène la météo", async ({
  browser,
}) => {
  const { ctx, page } = await open(browser);
  let reads = 0;
  await ctx.route("**/api/me/home*", async (route) => {
    const res = await route.fetch();
    if (!route.request().url().includes("blocks=app") || reads++ > 0) return route.fulfill({ response: res });
    const json = (await res.json()) as Record<string, unknown>;
    // Lot R8m : « Ma météo » porte l'attente (`myWeather.pending`) ; le stock vide est simulé sur ses lieux.
    const mine = json.myWeather as { places: Record<string, unknown>[] };
    const myWeather = { ...mine, pending: true, places: mine.places.map((pl) => ({ ...pl, weather: null })) };
    return route.fulfill({ response: res, json: { ...json, weather: null, weatherPending: true, myWeather } });
  });
  await page.goto("/accueil");
  await afterOpening(page);
  const pending = page.getByTestId("home-weather-pending");
  await expect(pending).toBeVisible({ timeout: 30_000 });
  await expect(pending).toContainText("Météo en cours de chargement");
  await expect(page.getByTestId("home-weather")).toContainText("Perpignan · ta ville");
  await expect(page.getByTestId("home-outing").first()).toBeVisible();
  await page.screenshot({ path: `${DIR}/appli-meteo-chargement-384.png` });
  // L'état reste jusqu'à la relecture unique de la seule météo du département (après le délai du fournisseur), puis la carte.
  await expect(page.getByTestId("home-weather")).toContainText(/Vent \d+\s*km\/h/, { timeout: 45_000 });
  await expect(pending).toHaveCount(0);
  await ctx.close();
});
