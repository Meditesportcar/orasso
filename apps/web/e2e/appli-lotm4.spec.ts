import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { addVehicleApi, apiCall, decideApi, login, MOBILE, randomPlate, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot M4, côté appli (version web de recette) : la feuille de candidature (« Avec quel véhicule ? », « Suivre » cochée
// d'office, newsletter non cochée, « J'ai vu le créneau d'arrivée »), Mon QR épuré (« Présente le QR code », « ? » à
// côté de « Hors ligne », plus de pavé des captures, Maps et Waze seulement à l'approche), le créneau strict des
// exposants absent de la fiche publique, l'étiquette « À propos de » d'un message écrit depuis la fiche. Deux thèmes,
// captures à 390 px. `M4_PHASE=avant` : captures seules, avant les changements (paires avant | après).
// Lancer avec APP_URL=http://localhost:8801 (relais isolé devant Metro), API et site seedés.
const APP = process.env.APP_URL;
const PHASE = process.env.M4_PHASE ?? "apres";
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-m4-captures/${PHASE}`;
const AFTER = PHASE !== "avant";
test.skip(!APP, "Appli : lancer avec APP_URL");

type Theme = "beton" | "sable";
type Cookie = string;
const THEMES: Theme[] = ["beton", "sable"];
const EXHIBITORS = { from: "17:00", to: "17:45", strict: true, note: "Entrée côté capitainerie." };

async function open(browser: Browser, theme: Theme) {
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
  await page
    .getByLabel("Mot de passe", { exact: true })
    .first()
    .fill(process.env.SEED_PASSWORD ?? "orasso-demo-2026");
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties/, { timeout: 30_000 });
}

async function goto(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function audit(page: Page) {
  const a = await auditPage(page);
  expect(a.greens).toEqual([]);
  expect(a.horizontalScroll).toBe(false);
  expect(a.truncated).toEqual([]);
  expect(a.primaryButtons).toBeLessThanOrEqual(1);
}

/** Un événement de MéditeSportCar dans `days` jours à 18 h (Paris), avec le créneau strict des exposants. */
async function eventIn(damien: Cookie, days: number, title: string) {
  const me = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(damien, "GET", "/me");
  const structureId = me.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId;
  const start = new Date();
  start.setDate(start.getDate() + days);
  start.setHours(18, 0, 0, 0);
  const created = await apiCall<{ id: string; slug: string }>(damien, "POST", `/structures/${structureId}/events`, {
    title,
    format: "gathering",
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 5 * 3600_000).toISOString(),
    addressLine: "Parking du port",
    postalCode: "66140",
    city: "Canet-en-Roussillon",
    department: "66",
    lat: 42.6988,
    lng: 3.0334,
    admittedVehicleTypes: ["car"],
    capacity: 40,
    maxVehiclesPerUser: 1,
    admission: "filtered",
    publicAccess: "free",
    registrationsOpenAt: new Date(Date.now() - 3600_000).toISOString(),
    previewHours: 0,
    rulesText: "Départs au pas, aucun burn.",
    description: "Événement de recette du lot M4.",
    arrivals: { exhibitors: EXHIBITORS, public: { from: "18:30", to: null, strict: false, note: null } },
  });
  expect(created.status).toBe(201);
  expect((await apiCall(damien, "POST", `/events/${created.data.id}/publish`)).status).toBe(200);
  return created.data;
}

test("Lot M4 : candidature, Mon QR, créneau privé, « À propos de »", async ({ browser }) => {
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  const damien = await login("damien@orasso.local");
  const id = unique();
  const soon = await eventIn(damien, 1, `M4 Veille ${id}`.slice(0, 34));
  const far = await eventIn(damien, 6, `M4 Semaine ${id}`.slice(0, 34));
  const open6 = await eventIn(damien, 9, `M4 Ouverte ${id}`.slice(0, 34));
  // Un exposant du 66 avec un véhicule photographié : retenu à la veille et à J-6.
  const pseudo = `ExpoM4_${id}`.slice(0, 24);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo);
  await apiCall(cookie, "PATCH", "/me/profile", { departments: ["66"] });
  const vehicleId = await addVehicleApi(cookie, randomPlate());
  const apply = async (eventId: string) => {
    const res = await apiCall<{ id: string }[]>(cookie, "POST", `/events/${eventId}/applications`, {
      vehicleIds: [vehicleId],
      rulesAccepted: true,
      followStructure: true,
      arrivalSeen: true,
    });
    expect(res.status).toBe(201);
    return res.data[0]?.id ?? "";
  };
  const appSoon = await apply(soon.id);
  const app6 = await apply(far.id);
  await decideApi(damien, soon.id, appSoon, "accept");
  await decideApi(damien, far.id, app6, "accept");

  // Le créneau strict des exposants n'est pas dans la fiche anonyme (API).
  const anon = await apiCall<{ arrivals: { exhibitors: unknown } }>(null, "GET", `/events/by-slug/${open6.slug}`);
  if (AFTER) expect(anon.data.arrivals.exhibitors).toBeNull();

  // Une conversation avec MéditeSportCar « À propos de » l'événement de la veille.
  const structureId = (
    await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(damien, "GET", "/me")
  ).data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId;
  const conv = await apiCall<{ id: string }>(cookie, "POST", `/structures/${structureId}/conversation`);
  await apiCall(cookie, "POST", `/conversations/${conv.data.id}/messages`, {
    clientId: crypto.randomUUID(),
    body: "Bonjour, je peux venir avec une remorque ?",
    ...(AFTER ? { aboutEventId: soon.id } : {}),
  });

  for (const theme of THEMES) {
    const { ctx, page } = await open(browser, theme);
    await signIn(page, email);

    // 1. Fiche d'un événement ouvert : pas de créneau des exposants affiché ; la feuille de candidature.
    await goto(page, `/e/${open6.slug}`);
    await expect(page.getByTestId("event-page")).toBeVisible({ timeout: 30_000 });
    await shot(page, `fiche-haut-${theme}`);
    if (AFTER) {
      await expect(page.getByTestId("arrival-exhibitors")).toHaveCount(0);
      await expect(page.getByText(/conseillé/i)).toHaveCount(0);
    }
    await page.getByTestId("event-primary").click();
    await expect(page.getByTestId("cand-sheet")).toBeVisible({ timeout: 15_000 });
    await shot(page, `candidature-${theme}`);
    if (AFTER) {
      await expect(page.getByTestId("cand-vehicle").first()).toBeVisible();
      await expect(page.getByTestId("cand-follow")).toHaveAttribute("aria-checked", "true");
      await expect(page.getByTestId("cand-follow")).toContainText("Suivre MéditeSportCar");
      await expect(page.getByTestId("cand-newsletter")).toHaveAttribute("aria-checked", "false");
      await expect(page.getByTestId("arrival-seen")).toContainText("J'ai vu le créneau d'arrivée");
      await expect(page.getByTestId("arrival-seen")).toContainText("17 h 00 à 17 h 45, strict");
      await expect(page.getByTestId("cand-send")).toBeDisabled();
      await page.getByTestId("arrival-seen").click();
      await page.getByTestId("cand-rules").click();
      await expect(page.getByTestId("cand-send")).toBeEnabled();
      await audit(page);
      await page.getByTestId("cand-sheet").evaluate((el) => {
        el.closest("[data-sheet-scroll]")?.scrollTo(0, 9999);
      });
      await shot(page, `candidature-bas-${theme}`);
    }
    await page.getByTestId("cand-close").click();

    // 2. Mon QR à la veille : Maps et Waze proposés ; un seul texte sous le QR.
    await goto(page, `/jour-j/${appSoon}`);
    await expect(page.getByTestId("qr-poster")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await shot(page, `mon-qr-veille-${theme}`);
    if (AFTER) {
      await expect(page.getByTestId("qr-say")).toHaveText("Présente le QR code");
      await expect(page.getByTestId("qr-capture-note")).toHaveCount(0);
      await expect(page.getByText("Comment ça marche sans réseau")).toHaveCount(0);
      await expect(page.getByText(/luminosité/i)).toHaveCount(0);
      await expect(page.getByTestId("gps-maps")).toBeVisible();
      await expect(page.getByTestId("gps-waze")).toBeVisible();
      await expect(page.getByTestId("gps-map")).toBeVisible();
      await expect(page.getByTestId("jourj-place")).toHaveCount(0);
      await page.getByTestId("qr-offline-help").click();
      await expect(page.getByTestId("qr-offline-pop")).toContainText("Comment ça marche sans réseau");
      await shot(page, `mon-qr-aide-${theme}`);
      await page.getByTestId("qr-offline-pop").getByRole("button", { name: "Compris" }).click();
      await expect(page.getByTestId("qr-offline-pop")).toHaveCount(0);
      await audit(page);
    }

    // 3. Mon QR à J-6 : ni Maps ni Waze, « Sur la carte » seulement.
    await goto(page, `/jour-j/${app6}`);
    await expect(page.getByTestId("qr-poster")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await shot(page, `mon-qr-j6-${theme}`);
    if (AFTER) {
      await expect(page.getByTestId("gps-maps")).toHaveCount(0);
      await expect(page.getByTestId("gps-waze")).toHaveCount(0);
      await expect(page.getByTestId("gps-map")).toBeVisible();
    }

    // 4. La conversation : l'étiquette « À propos de » l'événement, des deux côtés.
    await goto(page, `/boite/${conv.data.id}`);
    await expect(page.getByText("Bonjour, je peux venir avec une remorque ?")).toBeVisible({ timeout: 30_000 });
    await shot(page, `conversation-${theme}`);
    if (AFTER) {
      await expect(page.getByTestId("message-about").first()).toContainText(soon.title.slice(0, 20));
      await expect(page.getByTestId("message-about").first()).toContainText("À propos de");
    }
    await ctx.close();
  }
});
