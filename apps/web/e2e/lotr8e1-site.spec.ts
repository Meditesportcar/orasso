import { expect, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, warmDepartmentWeather } from "./helpers";

// Lot R8e1, côté site : la météo de l'événement est une ligne de la carte « Prochaine sortie » (/app) ; absente quand la
// météo n'est pas visible (au-delà de 7 jours) ; bandeau quand l'événement est « Incertain » ; masquer « Météo de
// l'événement » (Personnaliser) la retire ; le bloc « Météo » ne dit que le département. Compte : Pilote_005 (Salon Argelès,
// aujourd'hui). API seedée avec WEATHER_PROVIDER=open-meteo et METEO_URL (stub local), comme `meteo.spec.ts`.
test.use({ actionTimeout: 30_000 });
test.describe.configure({ mode: "serial" });

const EMAIL = "pilote5@orasso.local";
const SALON = "salon-argeles";
const HEADLINE = /^\p{Lu}\p{L}+ : \d+°, vent \d+\s*km\/h$/u;
const DEFAULT_HIDDEN = ["agenda", "favorite_garage", "pending"];

type Home = { widgets: { order: string[]; hidden: string[] } };
let cookie: string;
let damien: string;
let salonId: string;

test.beforeAll(async () => {
  cookie = await login(EMAIL);
  damien = await login("damien@orasso.local");
  await warmDepartmentWeather(cookie); // le stock du département (l'Accueil ne lit que lui)
  await apiCall(cookie, "PUT", "/me/home/widgets", { order: [], hidden: ["live", ...DEFAULT_HIDDEN] });
  salonId = (await apiCall<{ id: string }>(damien, "GET", `/events/by-slug/${SALON}`)).data.id;
  await apiCall(damien, "PATCH", `/events/${salonId}/outlook`, { outlook: "maintained" });
});
test.afterAll(async () => {
  await apiCall(cookie, "PUT", "/me/home/widgets", { order: [], hidden: DEFAULT_HIDDEN });
  await apiCall(damien, "PATCH", `/events/${salonId}/outlook`, { outlook: "maintained" });
});

for (const width of [390, 1280]) {
  test(`${width} px : la ligne météo est dans la carte « Prochaine sortie », le bloc « Météo » dit le département`, async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
    const page = await ctx.newPage();
    await loginInBrowser(page, EMAIL, undefined, "/app");
    await page.goto("/app");
    await page.waitForLoadState("networkidle");
    const card = page.getByTestId("next-access");
    await expect(card).toBeVisible();
    const line = card.getByTestId("home-outing-weather");
    await expect(line).toBeVisible();
    await expect(line).toHaveAttribute("aria-label", /^Météo de \p{Ll}+ : .+, \d+ degrés, vent \d+\s*km\/h$/u);
    expect(((await line.innerText()).split("\n")[0] ?? "").trim()).toMatch(HEADLINE);
    await expect(card.getByTestId("home-outing-weather-sub")).toContainText(/ · Open-Meteo$/);
    await expect(card.getByTestId("home-outing-weather-sub")).not.toContainText("Météo :");
    // Au-dessus du bouton « Voir mon accès ».
    const a = await line.boundingBox();
    const b = await card.getByRole("link", { name: /Voir mon accès/i }).boundingBox();
    expect(a && b && a.y + a.height <= b.y + 1).toBe(true);
    await expect(card.getByTestId("home-outing-weather-banner")).toHaveCount(0);
    // Le bloc « Météo » : le département seulement, jamais l'événement.
    const block = page.getByTestId("widget-weather");
    await expect(block.getByTestId("weather-place")).toContainText("Dép. 66");
    await expect(block).not.toContainText("Salon Argelès");
    // Pas d'horizontale parasite.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await ctx.close();
  });
}

test("événement « Incertain » : seconde ligne « Prévision peu sûre » ou libellé du temps le jour même, et bandeau", async ({
  page,
}) => {
  expect((await apiCall(damien, "PATCH", `/events/${salonId}/outlook`, { outlook: "uncertain" })).status).toBe(200);
  await loginInBrowser(page, EMAIL, undefined, "/app");
  const card = page.getByTestId("next-access");
  await expect(card.getByTestId("home-outing-weather-banner")).toHaveText(
    "Météo incertaine : on la revérifie la veille et le matin.",
  );
  // Le Salon a lieu aujourd'hui : on garde le libellé du temps.
  await expect(card.getByTestId("home-outing-weather-sub")).toContainText(/ · Open-Meteo$/);
  await apiCall(damien, "PATCH", `/events/${salonId}/outlook`, { outlook: "maintained" });
});

test("Personnaliser : « Météo de l'événement » masqué retire la ligne ; réaffiché, elle revient", async ({ page }) => {
  await loginInBrowser(page, EMAIL, undefined, "/app/accueil/personnaliser");
  await page.goto("/app/accueil/personnaliser");
  const row = page.getByTestId("personalize-row-event_weather");
  await expect(row).toContainText("Météo de l'événement");
  await expect(row).toContainText("Affiche ou masque la ligne météo de la carte « Prochaine sortie »");
  await page.getByTestId("hide-event_weather").click();
  await expect
    .poll(async () => (await apiCall<Home>(cookie, "GET", "/me/home")).data.widgets.hidden)
    .toContain("event_weather");
  await page.goto("/app");
  await expect(page.getByTestId("next-access")).toBeVisible();
  await expect(page.getByTestId("home-outing-weather")).toHaveCount(0);
  await page.goto("/app/accueil/personnaliser");
  await page.getByTestId("add-event_weather").click();
  await expect
    .poll(async () => (await apiCall<Home>(cookie, "GET", "/me/home")).data.widgets.hidden)
    .not.toContain("event_weather");
  await page.goto("/app");
  await expect(page.getByTestId("home-outing-weather")).toBeVisible();
});

test("« En cours » porte la météo de son événement ; Personnaliser : la ligne météo n'a que l'œil", async ({
  page,
}) => {
  const kenji = await login("kenji@orasso.local");
  await apiCall(kenji, "PUT", "/me/home/widgets", { order: [], hidden: DEFAULT_HIDDEN });
  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");
  const live = page.getByTestId("home-live-line");
  await expect(live).toBeVisible();
  const line = live.getByTestId("home-outing-weather");
  await expect(line).toBeVisible();
  expect(((await line.innerText()).split("\n")[0] ?? "").trim()).toMatch(HEADLINE);
  const a = await line.boundingBox();
  const b = await live.getByTestId("home-live-sheet").boundingBox();
  expect(a && b && a.y + a.height <= b.y + 1).toBe(true);
  await page.goto("/app/accueil/personnaliser");
  await expect(page.getByTestId("personalize-row-event_weather")).toBeVisible();
  await expect(page.getByTestId("up-event_weather")).toHaveCount(0);
  await expect(page.getByTestId("down-event_weather")).toHaveCount(0);
  await expect(page.getByTestId("hide-event_weather")).toBeVisible();
  await expect(page.getByTestId("up-live")).toBeDisabled();
});
