import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import pg from "pg";
import { apiCall, login, unique } from "./helpers";
import { RELAIS } from "./relais";

// R6-police : « 4,8 km » porte une espace insécable (`\s` dans l'attente).
// Lot R5d (maquette R5.11), fiche de l'événement : distance « à 23 km de toi » (calculée sur le téléphone, jamais sans
// que la personne l'ait accordée ou demandée), « Voir la distance » sans permission (une seule fois), « Y aller »
// (Maps, Waze) à J-10, rien sans adresse ni coordonnées. Béton et Sable, 390 et 384 px, puis 320 px (stress qui tient lieu
// de police agrandie : la version web de recette ne reçoit pas le fontScale d'Android).
// `R5D_PHASE=avant` : captures seules, avant les changements.
// Lancer avec APP_URL=http://localhost:9001 (appli compilée), API et site seedés.
const APP = process.env.APP_URL;
const PHASE = process.env.R5D_PHASE ?? "apres";
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r5d-captures/${PHASE}`;
const AFTER = PHASE !== "avant";
test.skip(!APP, "Appli : lancer avec APP_URL");

type Theme = "beton" | "sable";
const THEMES: Theme[] = ["beton", "sable"];
// Canet-en-Roussillon (événement) ; l'appareil est à Perpignan, à environ 12 km à vol d'oiseau.
const EVENT = { lat: 42.6988, lng: 3.0334 };
const DEVICE = { latitude: 42.6887, longitude: 2.8948 };

async function open(browser: Browser, theme: Theme, width: number, geo: boolean) {
  const ctx = await browser.newContext({
    viewport: { width, height: 844 },
    baseURL: APP,
    ...(geo ? { geolocation: DEVICE, permissions: ["geolocation" as const] } : {}),
  });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  return { ctx, page };
}

async function goto(page: Page, path: string) {
  await page.goto(path);
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

/** Intercepte l'ouverture des liens (Linking.openURL de la version web appelle window.open). */
async function recordOpens(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __opens: string[] };
    w.__opens = [];
    window.open = (url) => {
      w.__opens.push(String(url));
      return null;
    };
  });
}
async function opened(page: Page): Promise<string[]> {
  await page.waitForTimeout(300);
  return page.evaluate(() => (window as unknown as { __opens: string[] }).__opens);
}

async function shot(page: Page, name: string) {
  // La ligne « Où » est sous le haut de la fiche : on l'amène vers le milieu de l'écran.
  await page.getByTestId("event-where").scrollIntoViewIfNeeded();
  await page.evaluate(() => document.querySelector('[data-testid="event-where"]')?.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function eventIn(cookie: string, days: number, title: string, place: Record<string, unknown>) {
  const me = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(cookie, "GET", "/me");
  const structureId = me.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId;
  const start = new Date();
  start.setDate(start.getDate() + days);
  start.setHours(18, 0, 0, 0);
  const created = await apiCall<{ id: string; slug: string }>(cookie, "POST", `/structures/${structureId}/events`, {
    title,
    format: "gathering",
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 5 * 3600_000).toISOString(),
    department: "66",
    admittedVehicleTypes: ["car"],
    capacity: 40,
    maxVehiclesPerUser: 1,
    admission: "filtered",
    publicAccess: "free",
    registrationsOpenAt: new Date(Date.now() - 3600_000).toISOString(),
    previewHours: 0,
    rulesText: "Départs au pas, aucun burn.",
    description: "Événement de recette du lot R5d.",
    ...place,
  });
  expect(created.status, JSON.stringify(created.data)).toBe(201);
  expect((await apiCall(cookie, "POST", `/events/${created.data.id}/publish`)).status).toBe(200);
  return created.data;
}

test("Lot R5d : distance et « Y aller » dans la fiche", async ({ browser }) => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  const damien = await login("damien@orasso.local");
  const id = unique();
  const address = { addressLine: "Parking du port", postalCode: "66140", city: "Canet-en-Roussillon" };
  const far = await eventIn(damien, 10, `R5d Loin ${id}`.slice(0, 34), { ...address, ...EVENT });
  const addressOnly = await eventIn(damien, 10, `R5d Adresse ${id}`.slice(0, 34), address);
  // L'API géocode l'adresse à la création (service IGN) : on retire les coordonnées en base pour de bon.
  {
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    try {
      await db.query("update events set lat = null, lng = null where id = $1", [addressOnly.id]);
    } finally {
      await db.end();
    }
    const check = await apiCall<{ lat: number | null; lng: number | null }>(
      null,
      "GET",
      `/events/by-slug/${addressOnly.slug}`,
    );
    expect(check.data.lat ?? null).toBeNull();
    expect(check.data.lng ?? null).toBeNull();
  }

  for (const theme of THEMES) {
    for (const width of [390, 384]) {
      // 1. Position déjà accordée : la distance s'affiche toute seule ; « Y aller » à J-10.
      {
        const { ctx, page } = await open(browser, theme, width, true);
        await goto(page, `/e/${far.slug}`);
        await expect(page.getByTestId("event-where")).toBeVisible({ timeout: 30_000 });
        if (AFTER) {
          await expect(page.getByTestId("event-distance")).toHaveText(/^à \d+(,\d)?\skm de toi$/, { timeout: 15_000 });
          await expect(page.getByTestId("event-distance-ask")).toHaveCount(0);
          await expect(page.getByTestId("event-go-maps")).toBeVisible();
          await expect(page.getByTestId("event-go-waze")).toBeVisible();
          const km = Number(((await page.getByTestId("event-distance").textContent()) ?? "").match(/\d+/)?.[0]);
          expect(km).toBeGreaterThan(8);
          expect(km).toBeLessThan(30);
        }
        await shot(page, `fiche-position-${theme}-${width}`);
        await ctx.close();
      }
      // 2. Sans permission : « Voir la distance », rien avant le toucher ; Maps et Waze présents.
      {
        const { ctx, page } = await open(browser, theme, width, false);
        await goto(page, `/e/${far.slug}`);
        await expect(page.getByTestId("event-where")).toBeVisible({ timeout: 30_000 });
        if (AFTER) {
          await expect(page.getByTestId("event-distance-ask")).toBeVisible({ timeout: 15_000 });
          await expect(page.getByTestId("event-distance")).toHaveCount(0);
          await expect(page.getByTestId("event-go-maps")).toBeVisible();
        }
        await shot(page, `fiche-sans-position-${theme}-${width}`);
        await ctx.close();
      }
    }
  }
  if (!AFTER) return;

  // 3. « Voir la distance » : la permission est demandée au toucher, puis la distance s'affiche.
  {
    const { ctx, page } = await open(browser, "beton", 390, false);
    await goto(page, `/e/${far.slug}`);
    await expect(page.getByTestId("event-distance-ask")).toBeVisible({ timeout: 30_000 });
    await ctx.grantPermissions(["geolocation"]);
    await ctx.setGeolocation(DEVICE);
    await page.getByTestId("event-distance-ask").click();
    await expect(page.getByTestId("event-distance")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("event-distance-ask")).toHaveCount(0);
    await expect(page.getByTestId("event-distance-note")).toBeVisible();
    await ctx.close();
  }
  {
    // Position refusée au toucher : le bouton disparaît, plus de distance, rien ne se relance.
    const { ctx, page } = await open(browser, "beton", 390, false);
    await goto(page, `/e/${far.slug}`);
    await expect(page.getByTestId("event-distance-ask")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("event-distance-ask").click();
    await expect(page.getByTestId("event-distance-ask")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByTestId("event-distance")).toHaveCount(0);
    await expect(page.getByTestId("event-go-maps")).toBeVisible();
    await shot(page, "fiche-position-refusee-beton-390");
    await ctx.close();
  }

  // 4. Les liens : par les coordonnées, puis par l'adresse seule (sans coordonnées : pas de distance, pas de bouton
  // « Voir la distance »). « Ni adresse ni coordonnées : rien » est couvert par `whereGo.test.ts` (l'API exige une adresse).
  {
    const { ctx, page } = await open(browser, "beton", 390, true);
    await recordOpens(page);
    await goto(page, `/e/${far.slug}`);
    await page.getByTestId("event-go-maps").click();
    await page.getByTestId("event-go-waze").click();
    expect(await opened(page)).toEqual([
      "https://www.google.com/maps/dir/?api=1&destination=42.6988%2C3.0334",
      "https://waze.com/ul?ll=42.6988,3.0334&navigate=yes",
    ]);
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, "sable", 390, true);
    await recordOpens(page);
    await goto(page, `/e/${addressOnly.slug}`);
    await expect(page.getByTestId("event-go-maps")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("event-go-waze")).toBeVisible();
    await expect(page.getByTestId("event-distance-ask")).toHaveCount(0);
    await expect(page.getByTestId("event-distance")).toHaveCount(0);
    await page.getByTestId("event-go-maps").click();
    await page.getByTestId("event-go-waze").click();
    const q = encodeURIComponent("Parking du port, Canet-en-Roussillon");
    expect(await opened(page)).toEqual([
      `https://www.google.com/maps/dir/?api=1&destination=${q}`,
      `https://waze.com/ul?q=${q}&navigate=yes`,
    ]);
    await shot(page, "fiche-adresse-seule-sable-390");
    await ctx.close();
  }

  // 5. Écran étroit (320 px) : rien de coupé ni de débordant, les deux boutons restent lisibles.
  {
    const { ctx, page } = await open(browser, "beton", 320, true);
    await goto(page, `/e/${far.slug}`);
    await expect(page.getByTestId("event-distance")).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const waze = await page.getByTestId("event-go-waze").boundingBox();
    expect(waze && waze.x >= 0 && waze.x + waze.width <= 320).toBe(true);
    await shot(page, "fiche-etroit-beton-320");
    await ctx.close();
  }
});
