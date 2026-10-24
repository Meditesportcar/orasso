import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  addVehicleApi,
  apiCall,
  applyApi,
  type Cookie,
  decideApi,
  login,
  loginInBrowser,
  MOBILE,
  randomPlate,
  SEED_PASSWORD,
  setTheme,
  signUpApi,
  unique,
} from "./helpers";
import { RELAIS } from "./relais";

// Lot R3b, tour 2 : paires de captures avant / après (relecture Opus, point 11), à lancer sur `main` (00d34cd4) puis
// sur la branche, avec `CAPTURES_DIR` différent : un compte neuf retenu à un événement de l'année suivante (héros de
// l'Accueil, ticket de Mes sorties), les lignes de crew de Personnes et crews (appli, 390 px) et la carte de la liste
// du site (1 280 px). Seulement des captures : aucune règle vérifiée ici (voir `appli-lotr3b`, `lotr3b-site`).
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r3b-captures/apres`;
const NEXT_YEAR = new Date().getFullYear() + 1;
test.use({ actionTimeout: 30_000 });

async function nextYearEvent(orga: Cookie) {
  const me = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(orga, "GET", "/me");
  const structureId = me.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId;
  const title = `Rasso du printemps ${unique()}`;
  const start = new Date(Date.UTC(NEXT_YEAR, 2, 14, 17, 0));
  const created = await apiCall<{ id: string; slug: string }>(orga, "POST", `/structures/${structureId}/events`, {
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
    admittedVehicleTypes: ["car", "moto"],
    capacity: 40,
    maxVehiclesPerUser: 2,
    admission: "filtered",
    publicAccess: "free",
    registrationsOpenAt: new Date(Date.now() - 3600_000).toISOString(),
    previewHours: 0,
    rulesText: "Pas de burn, pas de bruit inutile, on respecte les riverains.",
    description: "Captures avant / après du lot R3b.",
  });
  if (created.status !== 201) throw new Error(`Création : ${created.status} ${JSON.stringify(created.data)}`);
  await apiCall(orga, "POST", `/events/${created.data.id}/publish`);
  return { id: created.data.id, title };
}

async function appPage(browser: Browser, theme: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  return page;
}

async function skipOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

test("R3b : captures avant / après (Accueil, Mes sorties, lignes de crew, carte du site)", async ({ browser }) => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  const orga = await login("damien@orasso.local");
  const event = await nextYearEvent(orga);
  const pseudo = `Avap${unique()}`.slice(0, 20);
  const cookie = await signUpApi(pseudo);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const vehicle = await addVehicleApi(cookie, randomPlate());
  await decideApi(orga, event.id, await applyApi(cookie, event.id, vehicle), "accept");

  if (APP) {
    for (const theme of ["beton", "sable"]) {
      const page = await appPage(browser, theme);
      await page.goto("/auth");
      await skipOpening(page);
      await page.getByLabel("E-mail").fill(email);
      await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
      await page.getByRole("button", { name: "Me connecter" }).click();
      await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 30_000 });
      await page.goto("/accueil");
      await skipOpening(page);
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${DIR}/appli-accueil-heros-${theme}.png` });
      await page.goto("/sorties");
      await skipOpening(page);
      await expect(page.getByText(event.title).first()).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${DIR}/appli-sorties-ticket-${theme}.png` });
      await page.goto("/explorer");
      await skipOpening(page);
      await page.getByTestId("segment-personnes").click();
      await expect(page.getByTestId("suggest-crews")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("suggest-crews").scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${DIR}/appli-personnes-crews-${theme}.png` });
      await page.context().close();
    }
  }

  for (const theme of ["beton", "sable"] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await setTheme(page, theme);
    await loginInBrowser(page, email, undefined, "/app");
    await page.goto(`/app/explorer?segment=evenements&autour=partout&q=${encodeURIComponent(event.title)}`);
    const tile = page.getByTestId("event-tile").filter({ hasText: event.title });
    await expect(tile).toBeVisible({ timeout: 30_000 });
    await tile.locator(".w-card__format").evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${DIR}/site-carte-liste-1280-${theme}.png` });
    await ctx.close();
  }
});
