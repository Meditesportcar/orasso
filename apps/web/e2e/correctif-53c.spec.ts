import { expect, type Page, type Route, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, MOBILE, samplePhoto, unique } from "./helpers";

// Correctif 53c, côté site : l'assistant de création (lot 53) ne supprime plus les missions chargées après une première
// saisie, ne les recrée pas après une panne de relecture, et attend la fin de l'envoi de la photo de l'affiche.
// Prérequis : API et site lancés sur la base seedée (damien@orasso.local, MéditeSportCar vérifiée).

const parisDay = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });

async function structureOf(cookie: string): Promise<string> {
  const me = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(cookie, "GET", "/me");
  return me.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId ?? "";
}

/** Un brouillon complet jusqu'à l'adresse, créé par l'API ; `needs` : missions à lui ajouter. */
async function draftEvent(cookie: string, title: string, needs: string[] = []): Promise<string> {
  const structureId = await structureOf(cookie);
  const date = parisDay(45);
  const created = await apiCall<{ id: string }>(cookie, "POST", `/structures/${structureId}/events`, {
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
    const n = await apiCall(cookie, "POST", `/events/${created.data.id}/needs`, { trade, quantity: 1 });
    expect(n.status, JSON.stringify(n.data)).toBe(201);
  }
  return created.data.id;
}

const needsOf = async (cookie: string, id: string) =>
  (await apiCall<{ id: string; trade: string }[]>(cookie, "GET", `/events/${id}/needs`)).data;

async function openWizard(page: Page, id: string, temps: string) {
  await page.goto(`/orga/meditesportcar/e/${id}/modifier?temps=${temps}`);
  const restored = page.getByTestId("wizard-restored");
  if (await restored.isVisible().catch(() => false)) await restored.getByRole("button").click();
}

test("missions chargées après une saisie : aucune n'est supprimée ; sans elles, rien ne s'enregistre", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const damien = await login("damien@orasso.local");
  const id = await draftEvent(damien, `Missions ${unique()}`, ["food_truck", "photographer"]);
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  await loginInBrowser(page, "damien@orasso.local", undefined, "/orga/meditesportcar");

  // Réponse de `GET /needs` retenue : le titre est changé tout de suite, avant qu'elle arrive.
  let release: () => void = () => undefined;
  const held = new Promise<void>((r) => {
    release = r;
  });
  await page.route(`**/api/events/${id}/needs`, async (route) => {
    if (route.request().method() === "GET") await held;
    await route.continue();
  });
  await page.goto(`/orga/meditesportcar/e/${id}/modifier?temps=type`);
  const title = `Renommé ${unique()}`;
  await page.getByLabel("Titre").fill(title);
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByTestId("wizard-error")).toContainText("se chargent");
  await expect(page.getByTestId("wizard-step")).toContainText("Type");
  const answered = page.waitForResponse(
    (r) => r.url().endsWith(`/api/events/${id}/needs`) && r.request().method() === "GET",
  );
  release();
  await answered;
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByTestId("wizard-step")).toContainText("Lieu", { timeout: 30_000 });
  expect((await needsOf(damien, id)).map((n) => n.trade).sort()).toEqual(["food_truck", "photographer"]);
  const ev = await apiCall<{ title: string }>(damien, "GET", `/events/${id}`);
  expect(ev.data.title).toBe(title);
  // Le titre tapé avant leur arrivée est resté, et les deux missions sont dans la saisie.
  await page.getByText("Sur place", { exact: true }).click();
  await expect(page.getByTestId("mission-row")).toHaveCount(2);

  // Chargement en échec : message, rien ne s'enregistre ; « Recharger les missions » débloque.
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
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith("orasso-wizard:")) localStorage.removeItem(k);
  });
  await page.goto(`/orga/meditesportcar/e/${id}/modifier?temps=type`);
  await expect(page.getByTestId("wizard-needs-failed")).toBeVisible();
  await page.getByLabel("Titre").fill(`${title} bis`);
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByTestId("wizard-error")).toContainText("n'ont pas pu être chargées");
  await expect(page.getByTestId("wizard-step")).toContainText("Type");
  expect(await needsOf(damien, id)).toHaveLength(2);
  await page.unroute(`**/api/events/${id}/needs`);
  await page.getByRole("button", { name: "Recharger les missions" }).click();
  await expect(page.getByTestId("wizard-needs-failed")).toHaveCount(0);
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByTestId("wizard-step")).toContainText("Lieu", { timeout: 30_000 });
  expect(await needsOf(damien, id)).toHaveLength(2);
  expect((await apiCall<{ title: string }>(damien, "GET", `/events/${id}`)).data.title).toBe(`${title} bis`);
  await ctx.close();
});

test("panne de relecture après la création d'une mission : le nouvel essai ne la recrée pas", async ({ browser }) => {
  test.setTimeout(180_000);
  const damien = await login("damien@orasso.local");
  const id = await draftEvent(damien, `Doublon ${unique()}`);
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  await loginInBrowser(page, "damien@orasso.local", undefined, "/orga/meditesportcar");
  await openWizard(page, id, "lieu");
  await page.getByText("Sur place", { exact: true }).click();
  await page.getByTestId("wizard-mission-add").click();
  await expect(page.getByTestId("mission-row")).toHaveCount(1);
  // La mission est créée, puis la relecture finale échoue une fois (réseau).
  let posted = false;
  let failed = false;
  await page.route(`**/api/events/${id}/needs`, async (route) => {
    const method = route.request().method();
    if (method === "POST") posted = true;
    if (method === "GET" && posted && !failed) {
      failed = true;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "unavailable", message: "Relecture impossible." } }),
      });
    }
    return route.continue();
  });
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByTestId("wizard-error")).toContainText("Relecture impossible");
  await expect(page.getByTestId("wizard-step")).toContainText("Lieu");
  expect(await needsOf(damien, id)).toHaveLength(1);
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByTestId("wizard-step")).toContainText("Arrivées", { timeout: 30_000 });
  expect(await needsOf(damien, id)).toHaveLength(1);
  await ctx.close();
});

test("photo de l'affiche en cours d'envoi : on attend sa fin avant de poursuivre", async ({ browser }) => {
  test.setTimeout(180_000);
  const damien = await login("damien@orasso.local");
  const id = await draftEvent(damien, `Affiche ${unique()}`);
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  await loginInBrowser(page, "damien@orasso.local", undefined, "/orga/meditesportcar");
  await openWizard(page, id, "affiche");
  let release: () => void = () => undefined;
  const held = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/api/me/uploads", async (route) => {
    await held;
    await route.continue();
  });
  await page
    .getByTestId("wizard-poster-photo")
    .locator("input")
    .setInputFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer: samplePhoto([40, 60, 120]) });
  await expect(page.getByTestId("wizard-poster-photo")).toContainText("Envoi de la photo");
  // Pendant l'envoi, ni « Continuer » ni « Retour ».
  await expect(page.getByTestId("wizard-next")).toBeDisabled();
  await expect(page.getByTestId("wizard-back")).toBeDisabled();
  // Ni une deuxième photo pendant l'envoi (tour 2 : elle libérait « Continuer » avant la fin du second envoi).
  await expect(page.getByTestId("wizard-poster-photo").locator("input")).toBeDisabled();
  release();
  await expect(page.getByTestId("wizard-next")).toBeEnabled({ timeout: 30_000 });
  await page.unroute("**/api/me/uploads");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByTestId("wizard-step")).toContainText("Tout est prêt", { timeout: 30_000 });
  const ev = await apiCall<{ posterSettings: { photoKey: string | null } | null }>(damien, "GET", `/events/${id}`);
  expect(ev.data.posterSettings?.photoKey).toBeTruthy();
  await ctx.close();
});

// --- Tour 2 (relectures du correctif 53c) ------------------------------------------------------------------------

const unavailable = (route: Route) =>
  route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: { code: "unavailable", message: "Relecture impossible." } }),
  });

test("saisie gardée d'avant le correctif (sans les missions) : la reprendre ne supprime aucune mission", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const damien = await login("damien@orasso.local");
  const id = await draftEvent(damien, `Gardée ${unique()}`, ["food_truck", "photographer"]);
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  await loginInBrowser(page, "damien@orasso.local", undefined, "/orga/meditesportcar");
  await openWizard(page, id, "type");
  await page.getByLabel("Titre").fill(`Gardée bis ${unique()}`);
  await page.waitForTimeout(800);
  // La saisie gardée devient celle d'une version d'avant : missions vides, aucune mission connue.
  const changed = await page.evaluate((eventId) => {
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith("orasso-wizard:") || !k.endsWith(eventId)) continue;
      const stored = JSON.parse(localStorage.getItem(k) ?? "{}");
      stored.draft.needs = [];
      delete stored.draft.knownNeedIds;
      localStorage.setItem(k, JSON.stringify(stored));
      return true;
    }
    return false;
  }, id);
  expect(changed).toBe(true);
  await page.goto(`/orga/meditesportcar/e/${id}/modifier?temps=type`);
  await expect(page.getByTestId("wizard-restored")).toBeVisible();
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByTestId("wizard-step")).toContainText("Lieu", { timeout: 30_000 });
  expect(await needsOf(damien, id)).toHaveLength(2);
  await page.getByText("Sur place", { exact: true }).click();
  await expect(page.getByTestId("mission-row")).toHaveCount(2);
  await ctx.close();
});

test("deux onglets : la mission créée dans le premier n'est pas supprimée par le second", async ({ browser }) => {
  test.setTimeout(180_000);
  const damien = await login("damien@orasso.local");
  const id = await draftEvent(damien, `Onglets ${unique()}`);
  const ctx = await browser.newContext({ viewport: MOBILE });
  const a = await ctx.newPage();
  await loginInBrowser(a, "damien@orasso.local", undefined, "/orga/meditesportcar");
  const b = await ctx.newPage();
  await openWizard(a, id, "lieu");
  await openWizard(b, id, "lieu");
  await expect(b.getByTestId("wizard-step")).toContainText("Lieu");
  // A ajoute une mission et enregistre.
  await a.getByText("Sur place", { exact: true }).click();
  await a.getByTestId("wizard-mission-add").click();
  await a.getByRole("button", { name: "Continuer" }).click();
  await expect(a.getByTestId("wizard-step")).toContainText("Arrivées", { timeout: 30_000 });
  expect(await needsOf(damien, id)).toHaveLength(1);
  // B, qui ne la connaissait pas, enregistre deux fois.
  await b.getByRole("button", { name: "Continuer" }).click();
  await expect(b.getByTestId("wizard-step")).toContainText("Arrivées", { timeout: 30_000 });
  await b.getByTestId("wizard-back").click();
  await b.getByRole("button", { name: "Continuer" }).click();
  await expect(b.getByTestId("wizard-step")).toContainText("Arrivées", { timeout: 30_000 });
  expect(await needsOf(damien, id)).toHaveLength(1);
  await ctx.close();
});

test("réponse perdue après la création d'une mission : le nouvel essai ne la recrée pas (clé de création)", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const damien = await login("damien@orasso.local");
  const id = await draftEvent(damien, `Perdue ${unique()}`);
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  await loginInBrowser(page, "damien@orasso.local", undefined, "/orga/meditesportcar");
  await openWizard(page, id, "lieu");
  await page.getByText("Sur place", { exact: true }).click();
  await page.getByTestId("wizard-mission-add").click();
  // Le serveur crée la mission, mais sa réponse ne revient pas ; la relecture finale échoue aussi.
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
      return unavailable(route);
    }
    return route.continue();
  });
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByTestId("wizard-error")).toBeVisible();
  await expect(page.getByTestId("wizard-step")).toContainText("Lieu");
  expect(await needsOf(damien, id)).toHaveLength(1);
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByTestId("wizard-step")).toContainText("Arrivées", { timeout: 30_000 });
  expect(await needsOf(damien, id)).toHaveLength(1);
  await ctx.close();
});

test("zone créée puis relecture en panne : le nouvel essai ne la dit pas refusée", async ({ browser }) => {
  test.setTimeout(180_000);
  const damien = await login("damien@orasso.local");
  const id = await draftEvent(damien, `Zone ${unique()}`);
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  await loginInBrowser(page, "damien@orasso.local", undefined, "/orga/meditesportcar");
  await openWizard(page, id, "lieu");
  await page.getByText("Sur place", { exact: true }).click();
  await page.getByRole("button", { name: "Ajouter une zone" }).click();
  await page.getByLabel("Code", { exact: true }).fill("JDM");
  await page.getByLabel("Nom", { exact: true }).fill("Zone JDM");
  let posted = false;
  let readFailed = false;
  await page.route(`**/api/events/${id}/zones`, async (route) => {
    if (route.request().method() === "POST") posted = true;
    return route.continue();
  });
  await page.route(`**/api/events/${id}`, async (route) => {
    if (route.request().method() === "GET" && posted && !readFailed) {
      readFailed = true;
      return unavailable(route);
    }
    return route.continue();
  });
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByTestId("wizard-error")).toContainText("Relecture impossible");
  // Tour 3 : le nom corrigé entre les deux essais est bien enregistré (la zone est mise à jour, pas recréée).
  await page.getByLabel("Nom", { exact: true }).fill("Zone JDM nord");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByTestId("wizard-step")).toContainText("Arrivées", { timeout: 30_000 });
  await expect(page.getByTestId("wizard-error")).toHaveCount(0);
  const ev = await apiCall<{ zones: { code: string; name: string }[] }>(damien, "GET", `/events/${id}`);
  expect(ev.data.zones.map((z) => [z.code, z.name])).toEqual([["JDM", "Zone JDM nord"]]);
  await ctx.close();
});

test("zone de même code créée ailleurs : le conflit reste visible (pas pris pour la sienne)", async ({ browser }) => {
  test.setTimeout(180_000);
  const damien = await login("damien@orasso.local");
  const id = await draftEvent(damien, `Conflit ${unique()}`);
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  await loginInBrowser(page, "damien@orasso.local", undefined, "/orga/meditesportcar");
  await openWizard(page, id, "lieu");
  await page.getByText("Sur place", { exact: true }).click();
  await page.getByRole("button", { name: "Ajouter une zone" }).click();
  await page.getByLabel("Code", { exact: true }).fill("JDM");
  await page.getByLabel("Nom", { exact: true }).fill("Ma zone");
  // Pendant ce temps, une zone JDM est créée ailleurs (autre onglet, autre membre).
  const other = await apiCall(damien, "POST", `/events/${id}/zones`, {
    code: "JDM",
    name: "Leur zone",
    capacity: null,
  });
  expect(other.status).toBe(201);
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByTestId("wizard-error")).toContainText("sauf la zone JDM");
  await expect(page.getByTestId("wizard-step")).toContainText("Lieu");
  const ev = await apiCall<{ zones: { name: string }[] }>(damien, "GET", `/events/${id}`);
  expect(ev.data.zones.map((z) => z.name)).toEqual(["Leur zone"]);
  await ctx.close();
});

test("missions en échec de chargement : la saisie reste gardée ; « Recharger » ne relance que les missions", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const damien = await login("damien@orasso.local");
  const id = await draftEvent(damien, `Échec ${unique()}`, ["food_truck"]);
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  await loginInBrowser(page, "damien@orasso.local", undefined, "/orga/meditesportcar");
  await page.route(`**/api/events/${id}/needs`, (route) =>
    route.request().method() === "GET" ? unavailable(route) : route.continue(),
  );
  await openWizard(page, id, "type");
  await expect(page.getByTestId("wizard-needs-failed")).toBeVisible();
  const title = `Hors missions ${unique()}`;
  await page.getByLabel("Titre").fill(title);
  await page.waitForTimeout(800);
  // Fermé puis rouvert, toujours sans missions : la saisie est là.
  await page.goto(`/orga/meditesportcar/e/${id}/modifier?temps=type`);
  await expect(page.getByTestId("wizard-restored")).toBeVisible();
  await expect(page.getByLabel("Titre")).toHaveValue(title);
  // « Recharger les missions » : les missions arrivent, la saisie et le temps restent.
  await page.unroute(`**/api/events/${id}/needs`);
  await page.getByRole("button", { name: "Recharger les missions" }).click();
  await expect(page.getByTestId("wizard-needs-failed")).toHaveCount(0);
  await expect(page.getByLabel("Titre")).toHaveValue(title);
  await expect(page.getByTestId("wizard-step")).toContainText("Type");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByTestId("wizard-step")).toContainText("Lieu", { timeout: 30_000 });
  expect(await needsOf(damien, id)).toHaveLength(1);
  expect((await apiCall<{ title: string }>(damien, "GET", `/events/${id}`)).data.title).toBe(title);
  await ctx.close();
});
