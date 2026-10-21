import { expect, type Page, test } from "@playwright/test";
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
  release();
  await expect(page.getByTestId("wizard-next")).toBeEnabled({ timeout: 30_000 });
  await page.unroute("**/api/me/uploads");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByTestId("wizard-step")).toContainText("Tout est prêt", { timeout: 30_000 });
  const ev = await apiCall<{ posterSettings: { photoKey: string | null } | null }>(damien, "GET", `/events/${id}`);
  expect(ev.data.posterSettings?.photoKey).toBeTruthy();
  await ctx.close();
});
