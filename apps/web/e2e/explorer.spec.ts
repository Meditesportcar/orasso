import { mkdirSync, writeFileSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { type Audit, auditPage } from "./audit";
import { apiCall, login, loginInBrowser, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Recherche de premier niveau et Explorer (lot 29, adapté au lot R2) sur le site : recherche « Supra » (véhicules et
// propriétaires), « Rivesaltes » (événement), « Mes affinités » (l'événement d'une structure suivie arrive en tête),
// filtres et « Ailleurs » (départements entiers), position de l'appareil (« Autour de moi », dans « Où chercher ? »),
// carte, segment Pros (par métier), Personnes et crews sans annuaire, confidentialité d'un compte privé. Avec CAPTURES=1, captures
// dans les deux thèmes, au bureau et sur téléphone, avec le contrôle automatique du système de design.
// Prérequis : site et API lancés sur la base locale avec le seed (dont `scripts/seed/explorer.ts`).
// Les crews (lot 19) : « drift » → crew reste à vérifier à la seconde passe.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-29-captures/site`;
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

/** Ouvre une feuille de l'Explorer : le clic n'a d'effet qu'une fois la page hydratée, on le répète jusqu'à la fenêtre. */
async function openSheet(page: Page, pill: string, sheet: string) {
  await expect(async () => {
    await page.getByTestId(pill).click();
    await expect(page.getByTestId(sheet)).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
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
  // Lot C5 : la loupe de l'AppBar ouvre le champ de recherche de l'Explorer (plus de champ dans l'en-tête).
  await page.getByRole("link", { name: "Rechercher", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/explorer\?segment=resultats/);
  await page.locator('#explorer-form input[name="q"]').fill("Supra");
  await page.locator("#explorer-form").getByRole("button", { name: "Rechercher" }).click();
  await expect(page).toHaveURL(/\/app\/explorer\?.*q=Supra/);
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
  // Lot R2 : « Partout en France » et « Mes affinités » (la structure suivie passe devant, comme avant).
  await page.goto("/app/explorer?segment=evenements&autour=partout&affinites=1");
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
  await page.goto("/app/explorer?segment=evenements&autour=partout&tri=date");
  await expect(firstTile()).not.toContainText("Organisateur suivi");

  // Filtre département + format.
  // « Ailleurs » : le département entier (l'Aude).
  await page.goto("/app/explorer?segment=evenements&autour=ailleurs&ailleurs=11&tri=date");
  const aude = await page.getByTestId("event-tile").locator("h3").allTextContents();
  expect(aude.length).toBeGreaterThanOrEqual(2);
  expect(aude).toContain("Rassemblement de Narbonne");
  expect(aude).not.toContain("Expo Rivesaltes");
  await page.goto("/app/explorer?segment=evenements&autour=partout&format=exhibition&tri=date");
  // Le format affiché sur la carte, pas le titre (le seed du lot 46 a un « Salon auto rétro » au format Exposition).
  const formats = await page.getByTestId("event-tile").locator(".w-card__format").allTextContents();
  expect(formats.length).toBeGreaterThan(0);
  for (const format of formats) expect(format).toMatch(/Exposition · \d/);

  // Distance depuis le secteur du profil (66) : un événement catalan avant Toulouse.
  await page.goto("/app/explorer?segment=evenements&autour=partout&tri=distance");
  await expect(firstTile()).toContainText(/à \d+(,\d)? km/);
  const near = await page.getByTestId("event-tile").locator("h3").allTextContents();
  // Toulouse après Rivesaltes, ou au-delà de la première page quand les recettes ont ajouté des événements proches
  // (lot 34 : la base de recette n'est pas remise à zéro entre deux passages).
  const rivesaltes = near.indexOf("Expo Rivesaltes");
  const toulouse = near.indexOf("Rassemblement de Toulouse");
  expect(rivesaltes).toBeGreaterThanOrEqual(0);
  expect(toulouse === -1 || toulouse > rivesaltes).toBe(true);

  // Mon coin : les départements du profil, entiers (le 66) : pas Toulouse.
  await page.goto("/app/explorer?segment=evenements&tri=distance&autour=coin");
  const radius = await page.getByTestId("event-tile").locator("h3").allTextContents();
  expect(radius).not.toContain("Rassemblement de Toulouse");
  expect(radius.length).toBeGreaterThan(0);

  // Carte : la page affiche la carte des événements localisés.
  await page.goto("/app/explorer?segment=evenements&autour=partout&vue=carte");
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
  // Lot R2 : « Où chercher ? » > Autour de moi (la position est lue sur ce geste).
  await openSheet(geo, "around-open", "where-sheet");
  await geo.getByTestId("around-me").click();
  await geo.getByTestId("where-apply").click();
  await expect(geo).toHaveURL(/lat=43\.6/);
  await expect(geo).toHaveURL(/lng=1\.4/);
  await expect(geo.getByTestId("position-note")).toContainText("non enregistrée");
  await expect(geo.getByTestId("event-tile").first()).toContainText("Toulouse");
  // Le choix est gardé (mode et distance), jamais la position : aucune coordonnée dans le cookie de préférence.
  const saved = (await ctx.cookies()).find((c) => c.name === "orasso-explorer");
  expect(decodeURIComponent(saved?.value ?? "")).toContain("autour=moi");
  expect(decodeURIComponent(saved?.value ?? "")).not.toMatch(/lat|lng/);
  // Le profil n'a pas bougé : toujours le département 66.
  const me = await apiCall<{ profile: { departments: string[] } }>(cookie, "GET", "/me");
  expect(me.data.profile.departments).toEqual(["66"]);
  await ctx.close();

  // --- Pros -----------------------------------------------------------------------------------------------------------
  await page.goto("/app/explorer?segment=pros");
  await expect(page.getByTestId("pros-list")).toBeVisible();
  await page.goto("/app/explorer?segment=pros&autour=partout&metier=detailing");
  const detailing = await page.getByTestId("pro-tile").locator("h3").allTextContents();
  expect(detailing).toContain("Detailing Hérault");
  expect(detailing).not.toContain("Garage des Corbières");
  await page.goto("/app/explorer?segment=pros&autour=ailleurs&ailleurs=34&vue=carte");
  await expect(page.getByTestId("pros-map")).toBeVisible();
  await page.goto("/app/explorer?segment=pros&tri=distance&autour=partout");
  await expect(page.getByTestId("pro-tile").first()).toContainText(/\d+(,\d)? km/);

  // --- Personnes et crews : aucun annuaire (lot R2) ------------------------------------------------------------------
  // Sans texte ni filtre : aucune liste de personnes ; des suggestions de comptes publics et de crews seulement.
  await page.goto("/app/explorer?segment=personnes");
  await expect(page.getByTestId("people-search")).toBeVisible();
  await expect(page.getByTestId("people-results")).toHaveCount(0);
  await expect(page.getByTestId("person-row")).toHaveCount(0);
  await expect(page.getByTestId("suggest-crews").getByTestId("crew-row").first()).toBeVisible();
  await expect(page.getByTestId("people-privacy")).toBeVisible();
  await page.goto("/app/explorer?segment=personnes&lieu=ailleurs&ailleurs=66");
  await expect(page.getByTestId("person-row")).toHaveCount(0);
  // Un grade ou un département seul n'est pas non plus un annuaire : il n'affine qu'une recherche par texte.
  await page.goto("/app/explorer?segment=personnes&grade=rodage");
  await expect(page.getByTestId("people-results")).toHaveCount(0);
  await expect(page.getByTestId("person-row")).toHaveCount(0);
  await expect(page.getByTestId("people-need-text")).toBeVisible();

  // --- Confidentialité : un compte privé que l'on ne connaît pas n'apparaît pas par son département ------------------
  // Par son pseudo, en revanche, il se trouve, réduit : ni département ni véhicule détaillé.
  await page.goto("/app/explorer?segment=personnes&q=Marc_66");
  const privateRow = page.getByTestId("people-results").getByTestId("person-row").filter({ hasText: "Marc_66" });
  await expect(privateRow).toContainText("Compte privé");
  await expect(privateRow).not.toContainText("Pyrénées-Orientales");
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
          ["03-evenements-affinites", "/app/explorer?segment=evenements&autour=partout&affinites=1"],
          ["04-evenements-carte", "/app/explorer?segment=evenements&autour=partout&vue=carte"],
          ["05-pros", "/app/explorer?segment=pros&autour=partout"],
          ["06-personnes", "/app/explorer?segment=personnes"],
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
