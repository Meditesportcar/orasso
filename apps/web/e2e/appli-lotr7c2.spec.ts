import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7c2 (D38), côté appli : l'Activité (la cloche) et les Messages (la bulle) remplacent la Boîte. Appli en version web
// de recette (`APP_URL`), Damien_66 (seed « Activité » du lot R7c1) et des comptes neufs. Vérifie : la pastille tombe à
// l'ouverture, le groupe « et N autres », le bandeau d'horaire, les Demandes sans demande de message, la ligne « Demandes de
// message », l'étiquette « Organisateur », la demande de message acceptée, une demande qui ne compte qu'une fois, les
// anciennes adresses de la Boîte qui redirigent.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7c2-captures/apres/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(1_000);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function skipOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function appLogin(browser: Browser, email: string, theme: string) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 844 }, baseURL: APP });
  await ctx.addInitScript((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  const page = await ctx.newPage();
  await page.goto("/auth");
  await skipOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties|profil|evenements|equipe/, { timeout: 30_000 });
  await skipOpening(page);
  return { ctx, page };
}

type Summary = { unseenActivity: number; pendingRequests: number; requests: { contact: number } };

test("la cloche : Demandes, bandeau d'horaire, groupe « et N autres », la pastille tombe, aucune conversation", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const damien = await login("damien@orasso.local");
  for (const theme of ["beton", "sable"] as const) {
    const { ctx, page } = await appLogin(browser, "damien@orasso.local", theme);
    if (theme === "beton") {
      const before = await apiCall<Summary>(damien, "GET", "/me/inbox/summary");
      expect(before.data.unseenActivity, "le seed pose des notifications non vues").toBeGreaterThan(0);
    }
    await page
      .getByRole("button", { name: /^Activité/ })
      .first()
      .click();
    await page.waitForURL(/\/activite$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Activité", exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("activity-requests-row")).toContainText(/Demandes · \d+/, { timeout: 30_000 });
    await expect(page.getByTestId("activity-requests-row")).not.toContainText("Demandes de message");
    await expect(page.getByTestId("activity-highlight").first()).toContainText("Changement d'horaire");
    await expect(
      page
        .getByTestId("activity-row")
        .filter({ hasText: /et 4 autres/ })
        .first(),
    ).toBeVisible();
    await expect(page.getByTestId("conversation-row")).toHaveCount(0);
    await expect
      .poll(async () => (await apiCall<Summary>(damien, "GET", "/me/inbox/summary")).data.unseenActivity, {
        timeout: 20_000,
      })
      .toBe(0);
    await shot(page, `activite-${theme}-384`);
    await page.getByTestId("activity-requests-row").click();
    await page.waitForURL(/\/activite\/demandes$/, { timeout: 30_000 });
    await expect(page.getByTestId("request-contact")).toHaveCount(0);
    await expect(page.getByTestId("request-staff-invitation").first()).toBeVisible({ timeout: 30_000 });
    await shot(page, `demandes-${theme}-384`);
    await ctx.close();
  }
});

test("la bulle : « Demandes de message », demande acceptée, étiquette « Organisateur », une demande compte une fois", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const s = unique();
  const a = `Aw7A${s}`;
  const c = `Aw7C${s}`;
  const u = `Aw7U${s}`;
  const aCookie = await signUpApi(a);
  const cCookie = await signUpApi(c);
  await signUpApi(u);
  expect(
    (await apiCall(cCookie, "POST", "/contact-requests", { pseudo: a, message: "Bonjour, belle voiture !" })).status,
  ).toBeLessThan(300);
  // Une demande ne compte qu'une fois : sa notification n'est pas dans les « non vus ».
  const sum = (await apiCall<Summary>(aCookie, "GET", "/me/inbox/summary")).data;
  expect(sum.unseenActivity).toBe(0);
  expect(sum.requests.contact).toBe(1);

  const { ctx, page } = await appLogin(browser, `${a.toLowerCase()}@e2e.orasso.test`, "beton");
  await page
    .getByRole("button", { name: /^Messages/ })
    .first()
    .click();
  await page.waitForURL(/\/messages$/, { timeout: 30_000 });
  await expect(page.getByTestId("messages-requests-row")).toContainText("Demandes de message", { timeout: 30_000 });
  await expect(page.getByTestId("activity-row")).toHaveCount(0);
  await shot(page, "messages-384");
  await page.getByTestId("messages-requests-row").click();
  await page.waitForURL(/\/messages\/demandes$/, { timeout: 30_000 });
  const card = page.getByTestId("request-contact").filter({ hasText: c });
  await expect(card).toContainText("belle voiture", { timeout: 30_000 });
  await shot(page, "messages-demandes-384");
  await card.getByText("Accepter").click();
  await page.waitForURL(/\/messages\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(page.getByTestId("messages")).toContainText("Bonjour, belle voiture !");
  await ctx.close();

  // U écrit à MéditeSportCar : sa conversation porte l'étiquette « Organisateur ».
  const uCookie = await login(`${u.toLowerCase()}@e2e.orasso.test`);
  const structures = await apiCall<{ id: string }>(uCookie, "GET", "/structures/by-slug/meditesportcar");
  expect(structures.status).toBe(200);
  const sent = await apiCall(uCookie, "POST", `/structures/${structures.data.id}/conversation`, {});
  expect(sent.status).toBeLessThan(300);
  const second = await appLogin(browser, `${u.toLowerCase()}@e2e.orasso.test`, "sable");
  await second.page.goto("/messages");
  await skipOpening(second.page);
  const row = second.page.getByTestId("conversation-row").first();
  await expect(row).toContainText("Organisateur", { timeout: 30_000 });
  await shot(second.page, "messages-organisateur-384");
  await second.ctx.close();
});

test("la Boîte redirige : /boite → Activité, /boite?onglet=messages → Messages", async ({ browser }) => {
  test.setTimeout(180_000);
  const { ctx, page } = await appLogin(browser, "kenji@orasso.local", "beton");
  await page.goto("/boite");
  await page.waitForURL(/\/activite$/, { timeout: 30_000 });
  await page.goto("/boite?onglet=messages");
  await page.waitForURL(/\/messages$/, { timeout: 30_000 });
  await ctx.close();
});
