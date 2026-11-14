import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD } from "./helpers";
import { sql } from "./lotr7f2-setup";

// Lot B2b, tour 1, côté appli (version web compilée de recette, `APP_URL`) : les événements d'une Page au-delà des 50 à venir et des
// 12 passés (parité avec le site, D20). Sur la page publique d'une structure (`/o/<slug>`) : « Voir plus » ajoute la suite sans doublon
// puis disparaît ; une panne de la première lecture se dit avec « Réessayer » (jamais « Aucun événement ») ; une panne de « Voir plus »
// se dit, garde la liste affichée, et « Réessayer » relit la suite. Les 64 événements de la recette sont retirés à la fin.
const APP = process.env.APP_URL;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

const EMAIL = "sarah@orasso.local";
const SLUG = "roues-libres-66";

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 }, baseURL: APP });
  await ctx.addInitScript(() => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", "beton");
  });
  const page = await ctx.newPage();
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
  return { ctx, page };
}

test("la page d'une structure : « Voir plus » au-delà de 50 à venir et 12 passés, panne de la première lecture et de la suite dites", async ({
  browser,
}) => {
  test.setTimeout(600_000);
  const cookie = await login(EMAIL);
  const me = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(cookie, "GET", "/me");
  const structureId = me.data.memberships.find((m) => m.structureSlug === SLUG)?.structureId ?? "";
  expect(structureId, "Sarah gère Roues Libres 66").not.toBe("");
  const stamp = `B2bA${Date.now().toString(36)}`;
  const created: string[] = [];
  const { ctx, page } = await open(browser);
  try {
    for (let i = 0; i < 64; i++) {
      const start = new Date(Date.now() + (2 + (i % 20)) * 24 * 3600 * 1000);
      const res = await apiCall<{ id: string }>(cookie, "POST", `/structures/${structureId}/events`, {
        title: `${stamp} ${String(i).padStart(2, "0")}`,
        format: "gathering",
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + 4 * 3600 * 1000).toISOString(),
        addressLine: "Parking du port",
        postalCode: "66140",
        city: "Canet-en-Roussillon",
        department: "66",
        lat: 42.6988,
        lng: 3.0334,
        admittedVehicleTypes: ["car"],
        capacity: 10,
        maxVehiclesPerUser: 1,
        admission: "open",
        publicAccess: "free",
        registrationsOpenAt: new Date(Date.now() - 3600_000).toISOString(),
        previewHours: 0,
        rulesText: "Recette du lot B2b (appli) : événement retiré à la fin.",
        description: "Événement de recette (pagination), retiré à la fin.",
      });
      expect(res.status, `création ${i}`).toBe(201);
      created.push(res.data.id);
      expect((await apiCall(cookie, "POST", `/events/${res.data.id}/publish`)).status).toBe(200);
    }
    // 13 passés (terminés il y a 2 à 14 jours), 51 restent à venir.
    for (const [k, id] of created.slice(0, 13).entries()) {
      await sql(
        "update events set starts_at = now() - make_interval(days => $2 + 1), ends_at = now() - make_interval(days => $2) where id = $1",
        [id, k + 1],
      );
    }
    const rows = () => page.getByTestId("structure-events").getByTestId("event-row").count();
    const url = `/o/${SLUG}?onglet=evenements`;

    // 1. Panne de la première lecture : dite, avec « Réessayer », jamais « Aucun événement ».
    await page.route("**/api/events?*structureId=*", (route) => route.fulfill({ status: 503, body: "{}" }));
    await page.goto(url);
    await afterOpening(page);
    await expect(page.getByTestId("structure-upcoming-error")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("structure-upcoming-error-retry")).toBeVisible();
    await expect(page.getByText("Aucun événement à venir")).toHaveCount(0);
    await page.unroute("**/api/events?*structureId=*");
    // Les passés ont échoué aussi : leur panne se dit, avec sa reprise.
    await expect(page.getByTestId("structure-past-error")).toBeVisible();
    await page.getByTestId("structure-past-error-retry").click();
    await page.getByTestId("structure-upcoming-error-retry").click();
    await expect(page.getByTestId("structure-upcoming-more")).toBeVisible({ timeout: 30_000 });
    // Les passés se lisent à part : on attend qu'ils soient là.
    await expect.poll(rows, { timeout: 30_000 }).toBeGreaterThanOrEqual(62);
    const first = await rows();

    // 2. Panne de « Voir plus » : dite, la liste reste, « Réessayer » relit la suite.
    await page.route("**/api/events?*cursor=*", (route) => route.fulfill({ status: 503, body: "{}" }));
    await page.getByTestId("structure-upcoming-more").click();
    await expect(page.getByTestId("structure-upcoming-more-error")).toBeVisible({ timeout: 30_000 });
    expect(await rows(), "la liste affichée ne bouge pas").toBe(first);
    await page.unroute("**/api/events?*cursor=*");
    await page.getByTestId("structure-upcoming-more-retry").click();
    await expect(page.getByTestId("structure-upcoming-more")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("structure-upcoming-more-error")).toHaveCount(0);
    expect(await rows(), "la suite s'ajoute").toBeGreaterThan(first);

    // 3. Les passés : « Voir plus » puis plus de bouton, aucune carte en double.
    await page.getByTestId("structure-past-more").click();
    await expect(page.getByTestId("structure-past-more")).toHaveCount(0, { timeout: 30_000 });
    const hrefs = await page
      .getByTestId("structure-events")
      .getByTestId("event-row")
      .evaluateAll((els) => els.map((e) => e.textContent));
    expect(new Set(hrefs).size, "aucune carte en double").toBe(hrefs.length);
  } finally {
    try {
      if (created.length) {
        await sql("delete from notifications where event_id = any($1::uuid[])", [created]);
        await sql("delete from events where id = any($1::uuid[])", [created]);
      }
    } finally {
      await ctx.close();
    }
  }
});
