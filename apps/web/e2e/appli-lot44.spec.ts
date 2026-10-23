import { mkdirSync } from "node:fs";
import type { EventPublic } from "@orasso/shared";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import {
  addVehicleApi,
  apiCall,
  applyApi,
  createEvent,
  login,
  MOBILE,
  randomPlate,
  SEED_PASSWORD,
  signUpApi,
  unique,
} from "./helpers";
import { RELAIS } from "./relais";

// Lot 44, côté appli (version web de recette) : Explorer v2 (position refusée → repli sur le 66, tout du plus proche au
// plus loin, filtres repliés, carte stylée rendue : canvas et style `orasso-<thème>`) et fiche événement v2 (affiche en
// vedette, créneaux d'arrivée en deux plaques, action principale selon le profil, fermé / pas encore ouvert), plus la
// candidature refusée sans la case « J'ai vu le créneau d'arrivée ». Deux thèmes, captures à 390 px.
// Lancer avec APP_URL=http://localhost:8291 (relais isolé devant Metro), API et site seedés (glyphes servis par le site).
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-44-captures/appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");

type Theme = "beton" | "sable";
const NOCTURNE = "nocturne-de-canet-2026";

async function open(browser: Browser, theme: Theme) {
  // Pas de permission de géolocalisation : la demande est refusée par le navigateur (repli sur le département).
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  return { ctx, page };
}

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function signIn(page: Page, email: string) {
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|direct|scanner|candidatures/, { timeout: 30_000 });
}

async function shot(page: Page, name: string) {
  // Chaque chargement complet rejoue l'ouverture (battle de 3 s) : on attend qu'elle soit passée.
  await afterOpening(page);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function audit(page: Page) {
  const a = await auditPage(page);
  expect(a.greens).toEqual([]);
  expect(a.horizontalScroll).toBe(false);
  expect(a.truncated).toEqual([]);
  expect(a.primaryButtons).toBeLessThanOrEqual(1);
}

/** Les distances affichées sur les cartes, dans l'ordre. */
async function distances(page: Page): Promise<number[]> {
  const texts = await page.getByTestId("event-km").allTextContents();
  return texts.map((t) => Number(t.replace(" km", "").replace(",", ".")));
}

test("Explorer v2 : position refusée → 66, du plus proche au plus loin, filtres, carte stylée", async ({ browser }) => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  // Un passionné du 66 avec un véhicule (exposant).
  const pseudo = `Explo44_${unique()}`.slice(0, 24);
  const cookie = await signUpApi(pseudo);
  await apiCall(cookie, "PATCH", "/me/profile", { departments: ["66"] });
  await addVehicleApi(cookie, randomPlate());
  for (const theme of ["beton", "sable"] as const) {
    const { ctx, page } = await open(browser, theme);
    await signIn(page, `${pseudo.toLowerCase()}@e2e.orasso.test`);
    await page.goto("/explorer");
    await afterOpening(page);
    // Demande à la première ouverture, puis refus → icône rouge et repli sur le 66.
    await expect(page.getByTestId("position-ask")).toBeVisible({ timeout: 30_000 });
    // Lot M4 : « N événements · distances depuis le centre du 66 ».
    await expect(page.getByTestId("sort-line")).toContainText("depuis le centre du 66");
    await shot(page, `explorer-demande-${theme}`);
    await page.getByTestId("position-enable").click();
    await expect(page.getByTestId("sort-line")).toContainText("position refusée : distances depuis le centre du 66", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("gps-button")).toContainText("Ma position"); // Lot C2a : libellé de l'artefact.
    await expect(page.getByTestId("event-row").first()).toBeVisible({ timeout: 30_000 });
    expect(await page.getByTestId("event-row").count()).toBeGreaterThan(3);
    const km = await distances(page);
    expect(km.length).toBeGreaterThan(3);
    expect([...km].sort((a, b) => a - b)).toEqual(km);
    await expect(page.getByTestId("sort-line")).toContainText("événement");
    await audit(page);
    await shot(page, `explorer-liste-${theme}`);

    // Filtres repliés : Format, Quand, Selon mes goûts.
    await page.getByText("Filtres", { exact: true }).click();
    await expect(page.getByTestId("explorer-filters")).toBeVisible();
    await page.getByTestId("explorer-filters").getByText("Exposition", { exact: true }).click();
    await expect(page.getByTestId("event-row").first()).toContainText("Exposition", { timeout: 30_000 });
    for (const row of await page.getByTestId("event-row").allTextContents()) expect(row).toContain("Exposition");
    await shot(page, `explorer-filtres-${theme}`);
    await page.getByTestId("explorer-filters").getByText("Tous", { exact: true }).click();
    await page.getByText("Mes affinités", { exact: true }).click();
    await expect(page.getByTestId("sort-line")).toContainText("affinités");
    await page.getByText("Mes affinités", { exact: true }).click();
    await page.getByText("Filtres", { exact: true }).click();

    // Carte stylée : canvas MapLibre, style du thème, étiquettes datées.
    await page.getByText("Carte", { exact: true }).click();
    const canvas = page.getByTestId("explorer-map-canvas");
    await expect(canvas).toHaveAttribute("data-map-style", `orasso-${theme}`, { timeout: 45_000 });
    await expect(canvas.locator("canvas.maplibregl-canvas")).toBeVisible();
    await expect(canvas.locator('[data-testid="map-marker"], [data-testid="map-cluster"]').first()).toBeVisible();
    // Lot C2a : carte en écran plein (`s-map`) : recherche en surimpression, légende, sans barre d'onglets.
    await expect(page).toHaveURL(/\/carte/);
    await expect(page.getByTestId("map-q")).toBeVisible();
    await expect(page.getByTestId("map-legend")).toContainText("Plusieurs");
    await expect(page.getByRole("tab", { name: "Explorer", exact: true })).toBeHidden();
    await page.waitForTimeout(3000);
    await shot(page, `explorer-carte-${theme}`);
    await ctx.close();
  }
});

test("Explorer : la carte suit le thème en direct et se replie sur le raster sans OpenFreeMap", async ({ browser }) => {
  test.setTimeout(300_000);
  const { ctx, page } = await open(browser, "beton");
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  await signIn(page, "kenji@orasso.local");
  await page.goto("/explorer");
  await afterOpening(page);
  await page.getByText("Plus tard", { exact: true }).click({ timeout: 30_000 });
  await page.getByText("Carte", { exact: true }).click();
  const canvas = page.getByTestId("explorer-map-canvas");
  await expect(canvas).toHaveAttribute("data-map-style", "orasso-beton-raster", { timeout: 45_000 });
  await expect(canvas.locator("canvas.maplibregl-canvas")).toBeVisible();
  await page.waitForTimeout(2000);
  await shot(page, "explorer-carte-repli-raster-beton");
  await ctx.close();
});

test("fiche v2 : affiche, créneaux, actions selon le profil, fermé, pas encore ouvert, case du créneau", async ({
  browser,
}) => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  // Lot M4 : le créneau des exposants est privé (absent de la fiche anonyme) ; l'organisation le lit.
  const orga = await login("damien@orasso.local");
  const noct = await apiCall<EventPublic>(orga, "GET", `/events/by-slug/${NOCTURNE}`);
  expect(noct.data.arrivals.exhibitors).not.toBeNull();
  expect((await apiCall<EventPublic>(null, "GET", `/events/by-slug/${NOCTURNE}`)).data.arrivals.exhibitors).toBeNull();
  // Un événement complet (une place, prise par un autre exposant) et un pas encore ouvert, créés par l'organisateur.
  const fullEvent = await createEvent(orga, { title: `Complet ${unique()}`, capacity: 1, admission: "open" });
  const other = await signUpApi(`Plein44_${unique()}`.slice(0, 24));
  await applyApi(other, fullEvent.id, await addVehicleApi(other, randomPlate()));
  const full = await apiCall<EventPublic>(null, "GET", `/events/by-slug/${fullEvent.slug}`);
  expect(full.data.remaining).toBe(0);
  const soonEvent = await createEvent(orga, { title: `Bientôt ${unique()}` });
  const later = await apiCall(orga, "PATCH", `/events/${soonEvent.id}`, {
    registrationsOpenAt: new Date(Date.now() + 2 * 86_400_000 - 3 * 3_600_000).toISOString(),
  });
  expect(later.status).toBe(200);

  // Un exposant neuf (véhicule, 66) : « Candidater avec ma … », puis la candidature refusée sans la case.
  const pseudo = `Fiche44_${unique()}`.slice(0, 24);
  const cookie = await signUpApi(pseudo);
  await apiCall(cookie, "PATCH", "/me/profile", { departments: ["66"] });
  const vehicleId = await addVehicleApi(cookie, randomPlate());

  for (const theme of ["beton", "sable"] as const) {
    const { ctx, page } = await open(browser, theme);
    await signIn(page, `${pseudo.toLowerCase()}@e2e.orasso.test`);
    await page.goto(`/e/${NOCTURNE}`);
    await afterOpening(page);
    await expect(page.getByTestId("event-hero")).toBeVisible({ timeout: 30_000 });
    // Lot M4 (correction de Damien) : le créneau des exposants est privé (feuille et « Ta place »), aucun horaire
    // « conseillé » ; le bouton dit seulement « Candidater ».
    await expect(page.getByTestId("arrival-exhibitors")).toHaveCount(0);
    if (noct.data.arrivals.public && !noct.data.arrivals.public.strict) {
      await expect(page.getByTestId("arrival-public")).toHaveCount(0);
    }
    await expect(page.getByTestId("event-primary")).toHaveText(/Candidater/);
    await audit(page);
    await shot(page, `fiche-ouverte-${theme}`);
    await page.getByTestId("event-seats").scrollIntoViewIfNeeded();
    await shot(page, `fiche-creneaux-${theme}`);

    if (fullEvent) {
      await page.goto(`/e/${fullEvent.slug}`);
      await expect(page.getByTestId("event-closed")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("join-waitlist")).toBeVisible();
      await shot(page, `fiche-fermee-${theme}`);
    }
    if (soonEvent) {
      await page.goto(`/e/${soonEvent.slug}`);
      await expect(page.getByTestId("event-soon")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("event-soon")).toContainText("Candidatures dès");
      await shot(page, `fiche-pas-encore-ouverte-${theme}`);
    }
    // Terminé : la raison, sans bouton principal.
    const past = await apiCall<{ items: { slug: string }[] }>(null, "GET", "/events?scope=past&limit=1");
    if (past.data.items[0]) {
      await page.goto(`/e/${past.data.items[0].slug}`);
      await expect(page.getByTestId("event-ended")).toContainText("Événement terminé", { timeout: 30_000 });
      await expect(page.getByTestId("event-primary")).toHaveCount(0);
      await shot(page, `fiche-terminee-${theme}`);
    }

    if (theme === "beton") {
      // Candidature (lot C2b : feuille unique `sh-cand`, l'ancien chemin `/candidater` l'ouvre) : « Envoyer » reste
      // grisé tant que la case du créneau n'est pas cochée.
      await page.goto(`/candidater/${NOCTURNE}`);
      await expect(page.getByTestId("cand-sheet")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("cand-rules").click();
      await expect(page.getByTestId("arrival-seen")).toBeVisible();
      await expect(page.getByTestId("cand-send")).toBeDisabled();
      await page.getByRole("checkbox", { name: /J'ai vu le créneau d'arrivée/ }).click();
      await expect(page.getByTestId("cand-send")).toBeEnabled();
      // Relecture C2b : une sélection de véhicules vidée exprès reste vide (pas de véhicule remis d'office).
      await page.getByTestId("cand-vehicle").first().click();
      await expect(page.getByTestId("cand-send")).toBeDisabled();
      await page.getByTestId("cand-vehicle").first().click();
      await expect(page.getByTestId("cand-send")).toBeEnabled();
      // La newsletter n'est pas cochée d'office (docs/01) : un appui la coche, un second la décoche.
      await expect(page.getByTestId("cand-newsletter")).not.toHaveAttribute("aria-checked", "true");
      await page.getByTestId("cand-newsletter").click();
      await expect(page.getByTestId("cand-newsletter")).toHaveAttribute("aria-checked", "true");
      await page.getByTestId("cand-newsletter").click();
      await expect(page.getByTestId("cand-newsletter")).not.toHaveAttribute("aria-checked", "true");
      await shot(page, "candidature-case-creneau-beton");
    }
    await ctx.close();
  }
  // L'API refuse aussi la candidature sans la case (lot 47).
  const refused = await apiCall(cookie, "POST", `/events/${noct.data.id}/applications`, {
    vehicleIds: [vehicleId],
    rulesAccepted: true,
    followStructure: false,
    newsletterOptIn: false,
    companions: 0,
  });
  expect(refused.status).toBe(400);
});

test("fiche v2 : l'action principale suit le profil (visiteur, pro, organisateur)", async ({ browser }) => {
  test.setTimeout(400_000);
  const cases: Array<{ email: string; casquette?: string; expected: RegExp; name: string }> = [
    {
      email: "paul.photo@orasso.local",
      expected: /Réserver mon entrée|Suivre l'organisateur|Organisateur suivi/,
      name: "visiteur",
    },
    {
      email: "garage@orasso.local",
      casquette: "pro",
      expected: /Suivre l'organisateur|Organisateur suivi/,
      name: "pro",
    },
    { email: "damien@orasso.local", casquette: "organizer", expected: /Trier les candidatures/, name: "organisateur" },
  ];
  for (const c of cases) {
    const { ctx, page } = await open(browser, "sable");
    await signIn(page, c.email);
    if (c.casquette) {
      await page.goto("/moi");
      await afterOpening(page);
      await page.getByTestId(`casquette-${c.casquette}`).first().click();
      await page.waitForTimeout(2000);
    }
    await page.goto(`/e/${NOCTURNE}`);
    await afterOpening(page);
    await expect(page.getByTestId("event-primary")).toHaveText(c.expected, { timeout: 30_000 });
    await shot(page, `fiche-action-${c.name}-sable`);
    await ctx.close();
  }
});

test("carte : la pastille de lieux confondus ouvre la liste de leurs événements", async ({ browser }) => {
  test.setTimeout(300_000);
  const orga = await login("damien@orasso.local");
  const tag = `Circuit ${unique()}`;
  await createEvent(orga, { title: `${tag} A` });
  await createEvent(orga, { title: `${tag} B` });
  const { ctx, page } = await open(browser, "sable");
  await signIn(page, "kenji@orasso.local");
  await page.goto("/explorer");
  await afterOpening(page);
  await page.getByText("Plus tard", { exact: true }).click({ timeout: 30_000 });
  await page.getByTestId("events-q").fill(tag);
  await expect(page.getByTestId("event-row")).toHaveCount(2, { timeout: 30_000 });
  await page.getByText("Carte", { exact: true }).click();
  const canvas = page.getByTestId("explorer-map-canvas");
  await expect(canvas).toHaveAttribute("data-map-style", "orasso-sable", { timeout: 45_000 });
  await canvas.getByTestId("map-cluster").click();
  await expect(page.getByTestId("map-picked").getByTestId("event-row")).toHaveCount(2);
  await shot(page, "explorer-carte-lieux-confondus-sable");
  await ctx.close();
});
