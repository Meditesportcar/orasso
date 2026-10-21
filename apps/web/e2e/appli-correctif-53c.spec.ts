import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, MOBILE, SEED_PASSWORD, samplePhoto, unique } from "./helpers";

// Correctif 53c, côté appli (version web de recette) : les missions chargées après une première saisie ne sont plus
// supprimées ; tant qu'elles ne sont pas chargées, rien ne s'enregistre ; « Continuer » attend l'envoi de la photo de
// l'affiche. Lancer avec APP_URL (Metro derrière `apps/mobile/scripts/web-isolated.mjs`), API seedée.
const APP = process.env.APP_URL;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 20_000 });

const parisDay = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });

async function open(browser: Browser) {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", "sable");
  });
  return { ctx, page };
}

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function signInOrganizer(page: Page) {
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill("damien@orasso.local");
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
  await page.goto("/moi");
  await afterOpening(page);
  await page.getByTestId("casquette-organizer").filter({ hasText: "MéditeSportCar" }).first().click();
  await page.waitForURL(/\/direct/, { timeout: 60_000 });
}

const v = (page: Page, id: string) => page.getByTestId(id).locator("visible=true").first();

test("appli : missions chargées après une saisie, aucune supprimée ; sans elles, rien ne s'enregistre", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const damien = await login("damien@orasso.local");
  const me = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(damien, "GET", "/me");
  const structureId = me.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId;
  const date = parisDay(45);
  const created = await apiCall<{ id: string }>(damien, "POST", `/structures/${structureId}/events`, {
    title: `Appli missions ${unique()}`,
    format: "night",
    startsAt: new Date(`${date}T17:00:00Z`).toISOString(),
    endsAt: new Date(`${date}T21:30:00Z`).toISOString(),
    addressLine: "Place de la Loge",
    city: "Perpignan",
    lat: 42.6986,
    lng: 2.8956,
    admittedVehicleTypes: ["car"],
    admission: "open",
    publicAccess: "free",
    registrationsOpenAt: new Date().toISOString(),
    previewHours: 0,
  });
  expect(created.status, JSON.stringify(created.data)).toBe(201);
  const id = created.data.id;
  for (const trade of ["food_truck", "photographer"]) {
    expect((await apiCall(damien, "POST", `/events/${id}/needs`, { trade, quantity: 1 })).status).toBe(201);
  }
  const needs = async () => (await apiCall<unknown[]>(damien, "GET", `/events/${id}/needs`)).data;
  const { ctx, page } = await open(browser);
  await signInOrganizer(page);

  // `GET /needs` retenue : le titre est changé avant qu'elle arrive ; « Continuer » attend les missions.
  let release: () => void = () => undefined;
  const held = new Promise<void>((r) => {
    release = r;
  });
  await page.route(`**/api/events/${id}/needs`, async (route) => {
    if (route.request().method() === "GET") await held;
    await route.continue();
  });
  await page.goto(`/evenement/${id}/modifier?temps=type`);
  await expect(v(page, "wizard-step")).toContainText("Type", { timeout: 30_000 });
  const title = `Appli renommé ${unique()}`;
  await v(page, "wizard-title").fill(title);
  await expect(v(page, "wizard-next")).toBeDisabled();
  release();
  await expect(v(page, "wizard-next")).toBeEnabled({ timeout: 30_000 });
  await expect(v(page, "wizard-title")).toHaveValue(title);
  await v(page, "wizard-next").click();
  await expect(v(page, "wizard-step")).toContainText("Lieu", { timeout: 30_000 });
  expect(await needs()).toHaveLength(2);
  expect((await apiCall<{ title: string }>(damien, "GET", `/events/${id}`)).data.title).toBe(title);

  // Chargement en échec : message, « Continuer » reste inactif ; « Recharger les missions » débloque.
  await page.unroute(`**/api/events/${id}/needs`);
  await page.route(`**/api/events/${id}/needs`, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "unavailable", message: "Indisponible." } }),
        })
      : route.continue(),
  );
  await page.goto(`/evenement/${id}/modifier?temps=type`);
  await expect(v(page, "wizard-needs-failed")).toBeVisible({ timeout: 30_000 });
  await v(page, "wizard-title").fill(`${title} bis`);
  await expect(v(page, "wizard-next")).toBeDisabled();
  await page.unroute(`**/api/events/${id}/needs`);
  await page.getByRole("button", { name: "Recharger les missions" }).click();
  await expect(page.getByTestId("wizard-needs-failed")).toHaveCount(0, { timeout: 30_000 });
  await expect(v(page, "wizard-title")).toHaveValue(`${title} bis`);
  await v(page, "wizard-next").click();
  await expect(v(page, "wizard-step")).toContainText("Lieu", { timeout: 30_000 });
  expect(await needs()).toHaveLength(2);
  expect((await apiCall<{ title: string }>(damien, "GET", `/events/${id}`)).data.title).toBe(`${title} bis`);
  await ctx.close();
});

test("appli : photo de l'affiche en cours d'envoi, on attend sa fin avant de poursuivre", async ({ browser }) => {
  test.setTimeout(240_000);
  const damien = await login("damien@orasso.local");
  const me = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(damien, "GET", "/me");
  const structureId = me.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId;
  const date = parisDay(46);
  const created = await apiCall<{ id: string }>(damien, "POST", `/structures/${structureId}/events`, {
    title: `Appli affiche ${unique()}`,
    format: "night",
    startsAt: new Date(`${date}T17:00:00Z`).toISOString(),
    endsAt: new Date(`${date}T21:30:00Z`).toISOString(),
    addressLine: "Place de la Loge",
    city: "Perpignan",
    lat: 42.6986,
    lng: 2.8956,
    admittedVehicleTypes: ["car"],
    admission: "open",
    publicAccess: "free",
    registrationsOpenAt: new Date().toISOString(),
    previewHours: 0,
  });
  expect(created.status, JSON.stringify(created.data)).toBe(201);
  const id = created.data.id;
  const { ctx, page } = await open(browser);
  await signInOrganizer(page);
  await page.goto(`/evenement/${id}/modifier?temps=affiche`);
  await expect(v(page, "wizard-step")).toContainText("Affiche", { timeout: 30_000 });
  await expect(v(page, "wizard-next")).toBeEnabled({ timeout: 30_000 });
  let release: () => void = () => undefined;
  const held = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/api/me/uploads", async (route) => {
    await held;
    await route.continue();
  });
  const chooser = page.waitForEvent("filechooser");
  await v(page, "wizard-poster-photo").click();
  await (await chooser).setFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer: samplePhoto([40, 60, 120]) });
  // Pendant l'envoi, ni « Continuer » ni « Retour ».
  await expect(v(page, "wizard-next")).toBeDisabled();
  await expect(v(page, "wizard-back")).toBeDisabled();
  // Ni une deuxième photo pendant l'envoi (tour 2).
  await expect(v(page, "wizard-poster-photo")).toBeDisabled();
  release();
  await expect(v(page, "wizard-next")).toBeEnabled({ timeout: 30_000 });
  await v(page, "wizard-next").click();
  await expect(v(page, "wizard-step")).toContainText("Tout est prêt", { timeout: 30_000 });
  const ev = await apiCall<{ posterSettings: { photoKey: string | null } | null }>(damien, "GET", `/events/${id}`);
  expect(ev.data.posterSettings?.photoKey).toBeTruthy();
  await ctx.close();
});

// --- Tour 2 (relectures du correctif 53c) ------------------------------------------------------------------------

async function appliDraft(title: string, needs: string[] = []): Promise<{ damien: string; id: string }> {
  const damien = await login("damien@orasso.local");
  const me = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(damien, "GET", "/me");
  const structureId = me.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId;
  const date = parisDay(47);
  const created = await apiCall<{ id: string }>(damien, "POST", `/structures/${structureId}/events`, {
    title,
    format: "night",
    startsAt: new Date(`${date}T17:00:00Z`).toISOString(),
    endsAt: new Date(`${date}T21:30:00Z`).toISOString(),
    addressLine: "Place de la Loge",
    city: "Perpignan",
    lat: 42.6986,
    lng: 2.8956,
    admittedVehicleTypes: ["car"],
    admission: "open",
    publicAccess: "free",
    registrationsOpenAt: new Date().toISOString(),
    previewHours: 0,
  });
  expect(created.status, JSON.stringify(created.data)).toBe(201);
  for (const trade of needs) {
    expect((await apiCall(damien, "POST", `/events/${created.data.id}/needs`, { trade, quantity: 1 })).status).toBe(
      201,
    );
  }
  return { damien, id: created.data.id };
}

test("appli : relecture en panne après la création d'une mission, le nouvel essai ne la recrée pas", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { damien, id } = await appliDraft(`Appli doublon ${unique()}`);
  const { ctx, page } = await open(browser);
  await signInOrganizer(page);
  await page.goto(`/evenement/${id}/modifier?temps=lieu`);
  await expect(v(page, "wizard-step")).toContainText("Lieu", { timeout: 30_000 });
  await expect(v(page, "wizard-next")).toBeEnabled({ timeout: 30_000 });
  await v(page, "wizard-panel-onsite-toggle").click();
  await v(page, "wizard-mission-add").click();
  let posted = false;
  let readFailed = false;
  await page.route(`**/api/events/${id}/needs`, async (route) => {
    const method = route.request().method();
    if (method === "POST") posted = true;
    if (method === "GET" && posted && !readFailed) {
      readFailed = true;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "unavailable", message: "Relecture impossible." } }),
      });
    }
    return route.continue();
  });
  await v(page, "wizard-next").click();
  // La relecture a échoué (erreur de l'API affichée par `OrgaFailure`) : on reste sur le temps.
  await expect.poll(() => readFailed, { timeout: 30_000 }).toBe(true);
  await expect(v(page, "wizard-next")).toBeEnabled({ timeout: 30_000 });
  await expect(v(page, "wizard-step")).toContainText("Lieu");
  expect((await apiCall<unknown[]>(damien, "GET", `/events/${id}/needs`)).data).toHaveLength(1);
  await v(page, "wizard-next").click();
  await expect(v(page, "wizard-step")).toContainText("Arrivées", { timeout: 30_000 });
  expect((await apiCall<unknown[]>(damien, "GET", `/events/${id}/needs`)).data).toHaveLength(1);
  await ctx.close();
});

test("appli : missions en échec de chargement, la saisie reste sur le téléphone", async ({ browser }) => {
  test.setTimeout(240_000);
  const { damien, id } = await appliDraft(`Appli échec ${unique()}`, ["food_truck"]);
  const { ctx, page } = await open(browser);
  await signInOrganizer(page);
  await page.route(`**/api/events/${id}/needs`, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "unavailable", message: "Indisponible." } }),
        })
      : route.continue(),
  );
  await page.goto(`/evenement/${id}/modifier?temps=type`);
  await expect(v(page, "wizard-needs-failed")).toBeVisible({ timeout: 30_000 });
  const title = `Appli hors missions ${unique()}`;
  await v(page, "wizard-title").fill(title);
  await page.waitForTimeout(1_000);
  await page.goto(`/evenement/${id}/modifier?temps=type`);
  await expect(v(page, "wizard-resumed")).toBeVisible({ timeout: 30_000 });
  await expect(v(page, "wizard-title")).toHaveValue(title);
  await page.unroute(`**/api/events/${id}/needs`);
  await page.getByRole("button", { name: "Recharger les missions" }).click();
  await expect(page.getByTestId("wizard-needs-failed")).toHaveCount(0, { timeout: 30_000 });
  await expect(v(page, "wizard-title")).toHaveValue(title);
  await v(page, "wizard-next").click();
  await expect(v(page, "wizard-step")).toContainText("Lieu", { timeout: 30_000 });
  expect((await apiCall<unknown[]>(damien, "GET", `/events/${id}/needs`)).data).toHaveLength(1);
  expect((await apiCall<{ title: string }>(damien, "GET", `/events/${id}`)).data.title).toBe(title);
  await ctx.close();
});

// --- Tour 3 ------------------------------------------------------------------------------------------------------

test("appli : réponse de création perdue, le nouvel essai ne recrée pas la mission (clé de création)", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { damien, id } = await appliDraft(`Appli perdue ${unique()}`);
  const { ctx, page } = await open(browser);
  await signInOrganizer(page);
  await page.goto(`/evenement/${id}/modifier?temps=lieu`);
  await expect(v(page, "wizard-step")).toContainText("Lieu", { timeout: 30_000 });
  await expect(v(page, "wizard-next")).toBeEnabled({ timeout: 30_000 });
  await v(page, "wizard-panel-onsite-toggle").click();
  await v(page, "wizard-mission-add").click();
  // Le serveur crée la mission, la réponse ne revient pas ; la relecture finale échoue aussi.
  let lost = false;
  let readFailed = false;
  await page.route(`**/api/events/${id}/needs`, async (route) => {
    const method = route.request().method();
    if (method === "POST" && !lost) {
      lost = true;
      await route.fetch();
      return route.abort("connectionreset");
    }
    if (method === "GET" && lost && !readFailed) {
      readFailed = true;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "unavailable", message: "Relecture impossible." } }),
      });
    }
    return route.continue();
  });
  await v(page, "wizard-next").click();
  await expect.poll(() => readFailed, { timeout: 30_000 }).toBe(true);
  await expect(v(page, "wizard-next")).toBeEnabled({ timeout: 30_000 });
  await expect(v(page, "wizard-step")).toContainText("Lieu");
  expect((await apiCall<unknown[]>(damien, "GET", `/events/${id}/needs`)).data).toHaveLength(1);
  await v(page, "wizard-next").click();
  await expect(v(page, "wizard-step")).toContainText("Arrivées", { timeout: 30_000 });
  expect((await apiCall<unknown[]>(damien, "GET", `/events/${id}/needs`)).data).toHaveLength(1);
  await ctx.close();
});

test("appli : « Recharger les missions » ne débloque l'enregistrement qu'après la réponse", async ({ browser }) => {
  test.setTimeout(240_000);
  const { id } = await appliDraft(`Appli recharge ${unique()}`, ["food_truck"]);
  const { ctx, page } = await open(browser);
  await signInOrganizer(page);
  let mode: "fail" | "hold" | "pass" = "fail";
  let release: () => void = () => undefined;
  const held = new Promise<void>((r) => {
    release = r;
  });
  await page.route(`**/api/events/${id}/needs`, async (route) => {
    if (route.request().method() !== "GET" || mode === "pass") return route.continue();
    if (mode === "hold") {
      await held;
      return route.continue();
    }
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "unavailable", message: "Indisponible." } }),
    });
  });
  await page.goto(`/evenement/${id}/modifier?temps=type`);
  await expect(v(page, "wizard-needs-failed")).toBeVisible({ timeout: 30_000 });
  mode = "hold";
  await page.getByRole("button", { name: "Recharger les missions" }).click();
  // Réponse retenue : rien ne s'enregistre encore.
  await page.waitForTimeout(800);
  await expect(v(page, "wizard-next")).toBeDisabled();
  mode = "pass";
  release();
  await expect(v(page, "wizard-next")).toBeEnabled({ timeout: 30_000 });
  await ctx.close();
});
