import { mkdirSync, writeFileSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { type Audit, auditPage } from "./audit";
import { apiCall, login, loginInBrowser, signUpApi, unique } from "./helpers";

// Recherche de premier niveau et Explorer (lot 29) sur le site : recherche « Supra » (véhicules et propriétaires),
// « Rivesaltes » (événement), tri par affinités (l'événement d'une structure suivie arrive en tête), filtres et
// département, position de l'appareil, carte, segment Pros, confidentialité d'un compte privé. Avec CAPTURES=1, captures
// dans les deux thèmes, au bureau et sur téléphone, avec le contrôle automatique du système de design.
// Prérequis : site et API lancés sur la base locale avec le seed (dont `scripts/seed/explorer.ts`).
// Les crews (lot 19) : « drift » → crew reste à vérifier à la seconde passe.
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/DELL/.claude/relais/orasso/lot-29-captures/site";
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
const VIEWS = [
  { id: "bureau", width: 1280, height: 900 },
  { id: "mobile", width: 390, height: 844 },
] as const;
const THEMES = ["beton", "sable"] as const;
const audits: Record<string, Audit> = {};

async function context(browser: Browser, theme: string, view: (typeof VIEWS)[number], cookie: string) {
  const ctx = await browser.newContext({ viewport: { width: view.width, height: view.height } });
  const url = new URL(WEB);
  const cookies = [{ name: "orasso-theme", value: theme, url: WEB }];
  for (const pair of cookie.split("; ").filter(Boolean)) {
    const i = pair.indexOf("=");
    cookies.push({ name: pair.slice(0, i), value: pair.slice(i + 1), url: `${url.protocol}//${url.host}` });
  }
  await ctx.addCookies(cookies);
  return ctx;
}

async function shot(page: Page, theme: string, view: string, name: string) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DIR}/${name}-${theme}-${view}.png`, fullPage: true });
  audits[`${name}-${theme}-${view}`] = await auditPage(page);
}

test("explorer : recherche, affinités, filtres, position, carte, pros, confidentialité", async ({ browser }) => {
  test.setTimeout(300_000);
  const s = unique();
  const pseudo = `Explo_${s}`;
  const cookie = await signUpApi(pseudo);
  await apiCall(cookie, "PATCH", "/me/profile", { departments: ["66"] });
  // Suit le club audois : ses événements passent devant ceux, plus proches, des structures qu'on ne suit pas.
  const club = await apiCall<{ id: string }>(cookie, "GET", "/structures/by-slug/club-audois-passion");
  expect((await apiCall(cookie, "POST", `/structures/${club.data.id}/follow`)).status).toBeLessThan(300);

  const page = await browser.newPage();
  await loginInBrowser(page, `${pseudo.toLowerCase()}@e2e.orasso.test`, undefined, "/app/explorer");

  // --- Recherche de premier niveau depuis l'en-tête -------------------------------------------------------------------
  await page.getByTestId("site-search").getByRole("searchbox").fill("Supra");
  await page.getByTestId("site-search").getByRole("button").click();
  await expect(page).toHaveURL(/\/app\/explorer\?q=Supra/);
  const vehicles = page.getByTestId("group-vehicles");
  await expect(vehicles).toBeVisible();
  await expect(vehicles.getByTestId("vehicle-hit").first()).toContainText("Toyota Supra");
  await expect(vehicles).toContainText("Kenji_66");
  // Jamais de plaque dans les résultats.
  await expect(page.getByTestId("search-results")).not.toContainText(/[A-Z]{2}-\d{3}-[A-Z]{2}/);

  await page.goto("/app/explorer?q=Rivesaltes");
  await expect(page.getByTestId("group-events")).toContainText("Expo Rivesaltes");
  await page
    .getByTestId("group-events")
    .getByRole("link", { name: /Expo Rivesaltes/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/e\/expo-rivesaltes/);

  // « drift » → crew (lot 19), avec sa carte réduite ; le segment Personnes et crews le montre aussi.
  await page.goto("/app/explorer?q=drift");
  await expect(page.getByTestId("group-crews")).toContainText("Roussillon Drift");
  await page.goto("/app/explorer?segment=personnes&q=drift");
  await expect(page.getByTestId("crew-results")).toContainText("Roussillon Drift");

  // Texte trop court : rien n'est cherché.
  await page.goto("/app/explorer?q=a");
  await expect(page.getByText("Saisis au moins deux caractères.")).toBeVisible();

  // « Voir tout » d'un groupe (plus de 5 événements pour « de ») renvoie vers le segment, avec le texte.
  await page.goto("/app/explorer?q=de");
  await page.getByTestId("see-all-evenements").click();
  await expect(page).toHaveURL(/segment=evenements/);
  await expect(page.getByTestId("events-segment")).toBeVisible();

  // --- Événements : affinités, date, distance -------------------------------------------------------------------------
  await page.goto("/app/explorer");
  const firstTile = () => page.getByTestId("event-tile").first();
  await expect(page.getByTestId("events-list")).toBeVisible();
  await expect(firstTile()).toContainText("Rassemblement de Narbonne");
  await expect(firstTile()).toContainText("Organisateur suivi");
  // Les événements du club suivi précèdent ceux des structures qu'on ne suit pas.
  const titles = await page.getByTestId("event-tile").locator("h3").allTextContents();
  const narbonne = titles.indexOf("Rassemblement de Narbonne");
  const carcassonne = titles.indexOf("Cars & Coffee de Carcassonne");
  expect(narbonne).toBeGreaterThanOrEqual(0);
  expect(carcassonne).toBeGreaterThan(narbonne);
  expect(titles.slice(0, carcassonne + 1)).not.toContain("Expo Rivesaltes");

  // Par date : l'ordre change, la distance n'a plus de pastille « organisateur suivi » en tête.
  await page.goto("/app/explorer?segment=evenements&tri=date");
  await expect(firstTile()).not.toContainText("Organisateur suivi");

  // Filtre département + format.
  await page.goto("/app/explorer?segment=evenements&departement=11&tri=date");
  const aude = await page.getByTestId("event-tile").locator("h3").allTextContents();
  expect(aude.length).toBeGreaterThanOrEqual(2);
  expect(aude).toContain("Rassemblement de Narbonne");
  expect(aude).not.toContain("Expo Rivesaltes");
  await page.goto("/app/explorer?segment=evenements&format=exhibition&tri=date");
  for (const title of await page.getByTestId("event-tile").locator("h3").allTextContents()) {
    expect(title).toMatch(/expo|exposition/i);
  }

  // Distance depuis le secteur du profil (66) : un événement catalan avant Toulouse.
  await page.goto("/app/explorer?segment=evenements&tri=distance");
  await expect(firstTile()).toContainText(/à \d+(,\d)? km/);
  const near = await page.getByTestId("event-tile").locator("h3").allTextContents();
  // Toulouse après Rivesaltes, ou au-delà de la première page quand les recettes ont ajouté des événements proches
  // (lot 34 : la base de recette n'est pas remise à zéro entre deux passages).
  const rivesaltes = near.indexOf("Expo Rivesaltes");
  const toulouse = near.indexOf("Rassemblement de Toulouse");
  expect(rivesaltes).toBeGreaterThanOrEqual(0);
  expect(toulouse === -1 || toulouse > rivesaltes).toBe(true);

  // Rayon : 50 km autour du secteur n'inclut pas Toulouse.
  await page.goto("/app/explorer?segment=evenements&tri=distance&rayon=50");
  const radius = await page.getByTestId("event-tile").locator("h3").allTextContents();
  expect(radius).not.toContain("Rassemblement de Toulouse");
  expect(radius.length).toBeGreaterThan(0);

  // Carte : la page affiche la carte des événements localisés.
  await page.goto("/app/explorer?segment=evenements&vue=carte");
  await expect(page.getByTestId("events-map")).toBeVisible();
  expect(Number(await page.getByTestId("events-map").getAttribute("data-count"))).toBeGreaterThan(5);

  // --- Position de l'appareil (facultative, arrondie, jamais enregistrée) --------------------------------------------
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ["geolocation"],
    geolocation: { latitude: 43.6047, longitude: 1.4442 },
  });
  const url = new URL(WEB);
  await ctx.addCookies(
    cookie.split("; ").map((pair) => {
      const i = pair.indexOf("=");
      return { name: pair.slice(0, i), value: pair.slice(i + 1), url: `${url.protocol}//${url.host}` };
    }),
  );
  const geo = await ctx.newPage();
  await geo.goto("/app/explorer?segment=evenements&tri=distance");
  await geo.getByTestId("use-position").click();
  await expect(geo).toHaveURL(/lat=43\.6&lng=1\.4/);
  await expect(geo.getByTestId("position-note")).toContainText("non enregistrée");
  await expect(geo.getByTestId("event-tile").first()).toContainText("Toulouse");
  // Le profil n'a pas bougé : toujours le département 66.
  const me = await apiCall<{ profile: { departments: string[] } }>(cookie, "GET", "/me");
  expect(me.data.profile.departments).toEqual(["66"]);
  await ctx.close();

  // --- Pros -----------------------------------------------------------------------------------------------------------
  await page.goto("/app/explorer?segment=pros");
  await expect(page.getByTestId("pros-list")).toBeVisible();
  await page.goto("/app/explorer?segment=pros&activite=detailing");
  const detailing = await page.getByTestId("pro-tile").locator("h3").allTextContents();
  expect(detailing).toContain("Detailing Hérault");
  expect(detailing).not.toContain("Garage des Corbières");
  await page.goto("/app/explorer?segment=pros&departement=34&vue=carte");
  await expect(page.getByTestId("pros-map")).toBeVisible();
  await page.goto("/app/explorer?segment=pros&tri=distance");
  await expect(page.getByTestId("pro-tile").first()).toContainText(/à \d+(,\d)? km/);

  // --- Confidentialité : un compte privé que l'on ne connaît pas n'apparaît pas par son département ------------------
  await page.goto("/app/explorer?segment=personnes&departement=66");
  await expect(page.getByTestId("people-results")).toBeVisible();
  const people = await page.getByTestId("person-row").allTextContents();
  expect(people.join(" ")).toContain("Kenji_66");
  expect(people.join(" ")).not.toContain("Marc_66");
  // Par son pseudo, en revanche, il se trouve, réduit : ni département ni véhicule détaillé.
  await page.goto("/app/explorer?q=Marc_66");
  const marc = page.getByTestId("group-people").getByTestId("person-row").filter({ hasText: "Marc_66" });
  await expect(marc).toBeVisible();
  await expect(marc).not.toContainText("66,");

  // --- Captures et contrôle du système de design ---------------------------------------------------------------------
  if (process.env.CAPTURES) {
    mkdirSync(DIR, { recursive: true });
    const loggedIn = await login(`${pseudo.toLowerCase()}@e2e.orasso.test`);
    for (const theme of THEMES) {
      for (const view of VIEWS) {
        const shotCtx = await context(browser, theme, view, loggedIn);
        const p = await shotCtx.newPage();
        for (const [name, path] of [
          ["01-resultats-supra", "/app/explorer?q=Supra"],
          ["02-resultats-rivesaltes", "/app/explorer?q=Rivesaltes"],
          ["03-evenements-affinites", "/app/explorer"],
          ["04-evenements-carte", "/app/explorer?segment=evenements&vue=carte&tri=distance"],
          ["05-pros", "/app/explorer?segment=pros&tri=distance"],
          ["06-personnes", "/app/explorer?segment=personnes&departement=66"],
        ] as const) {
          await p.goto(path);
          await shot(p, theme, view.id, name);
        }
        await shotCtx.close();
      }
    }
    writeFileSync(`${DIR}/audit.json`, JSON.stringify(audits, null, 2));
  }
  await page.close();
});
