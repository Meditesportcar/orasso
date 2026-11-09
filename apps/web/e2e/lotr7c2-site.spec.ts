import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { apiCall, loginInBrowser, MOBILE, setTheme, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7c2 (D38), côté site : l'Activité (la cloche) et les Messages (la bulle) remplacent la Boîte. Damien_66 (le seed
// « Activité » du lot R7c1 : horaire modifié du Lydia, cinq flammes regroupées, deux demandes, une demande de message)
// et des comptes neufs. Vérifie : la pastille tombe à l'ouverture, le groupe « et N autres », le bandeau d'horaire, les
// Demandes sans demande de message, l'étiquette « Organisateur », la demande de message acceptée depuis sa page, aucune
// conversation dans l'Activité ni notification dans Messages, une demande qui ne compte qu'une fois, les redirections 302.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7c2-captures/apres/recette-site`;
test.use({ actionTimeout: 30_000, viewport: MOBILE });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
}

type Summary = {
  unreadMessages: number;
  unseenActivity: number;
  pendingRequests: number;
  requests: { contact: number };
};
const summaryOf = async (page: Page) => (await (await page.request.get("/api/me/inbox/summary")).json()) as Summary;

test("la cloche : Demandes, bandeau d'horaire, groupe « et N autres », la pastille tombe, aucune conversation", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  for (const theme of ["beton", "sable"] as const) {
    const ctx = await browser.newContext({ viewport: MOBILE });
    const page = await ctx.newPage();
    await setTheme(page, theme);
    await loginInBrowser(page, "damien@orasso.local", undefined, "/app");
    // Premier passage seulement : ouvrir la cloche vide les non vus (le deuxième thème repart de zéro).
    if (theme === "beton") {
      const before = await summaryOf(page);
      expect(before.unseenActivity, "le seed pose des notifications non vues").toBeGreaterThan(0);
    }
    await page
      .locator("header.o-appbar--tab")
      .getByRole("link", { name: /^Activité/ })
      .click();
    await page.waitForURL((url) => url.pathname === "/app/activite");
    await expect(page.getByRole("heading", { name: "Activité", exact: true })).toBeVisible();
    // Ligne repliée « Demandes · N » (hors demande de message), bandeau d'horaire, groupe regroupé.
    const row = page.getByTestId("activity-requests-row");
    await expect(row).toContainText(/Demandes · \d+/);
    await expect(row).not.toContainText("Demandes de message");
    const band = page.getByTestId("activity-highlight").first();
    await expect(band).toContainText("Changement d'horaire");
    await expect(
      page
        .getByTestId("activity-row")
        .filter({ hasText: /et 4 autres/ })
        .first(),
    ).toBeVisible();
    // Le bandeau d'horaire n'est pas répété dans les groupes ; aucune conversation, aucune demande dans la liste.
    await expect(page.locator(".s-convo")).toHaveCount(0);
    await expect(page.getByTestId("activity-row").filter({ hasText: "Demande de contact" })).toHaveCount(0);
    // La pastille « non vus » tombe : la cloche de la barre ne compte plus que les demandes.
    await expect.poll(async () => (await summaryOf(page)).unseenActivity, { timeout: 20_000 }).toBe(0);
    await shot(page, `activite-${theme}-390`);
    await page.goto("/app/activite/demandes");
    await expect(page.getByRole("heading", { name: "Demandes", exact: true })).toBeVisible();
    await expect(page.getByTestId("request-contact")).toHaveCount(0);
    await expect(page.getByTestId("request-staff-invitation").first()).toBeVisible();
    await shot(page, `demandes-${theme}-390`);
    await ctx.close();
  }
});

test("la bulle : conversations seulement, « Demandes de message », étiquette « Organisateur », demande acceptée", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const s = unique();
  const a = `Sw7A${s}`;
  const c = `Sw7C${s}`;
  const u = `Sw7U${s}`;
  await signUpApi(a);
  const cCookie = await signUpApi(c);
  await signUpApi(u);
  // C (qui ne suit pas A) demande le contact de A.
  expect(
    (await apiCall(cCookie, "POST", "/contact-requests", { pseudo: a, message: "Bonjour, belle voiture !" })).status,
  ).toBeLessThan(300);

  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  await loginInBrowser(page, `${a.toLowerCase()}@e2e.orasso.test`, undefined, "/app");
  // Une demande ne compte qu'une fois : la bulle (demande de message) a 1, la cloche rien.
  const header = page.locator("header.o-appbar--tab");
  await expect(header.getByRole("link", { name: /^Messages/ }).locator(".o-appbar__count")).toHaveText("1");
  await expect(header.getByRole("link", { name: /^Activité/ }).locator(".o-appbar__count")).toHaveCount(0);
  const sum = await summaryOf(page);
  expect(sum.unseenActivity).toBe(0);
  expect(sum.requests.contact).toBe(1);

  await header.getByRole("link", { name: /^Messages/ }).click();
  await page.waitForURL((url) => url.pathname === "/app/messages");
  await expect(page.getByTestId("message-requests-row")).toContainText("Demandes de message · 1");
  await expect(page.getByTestId("activity-row")).toHaveCount(0);
  await expect(page.getByTestId("journal-item")).toHaveCount(0);
  await shot(page, "messages-vide-390");
  await page.getByTestId("message-requests-row").click();
  await page.waitForURL((url) => url.pathname === "/app/messages/demandes");
  const request = page.getByTestId("request-contact").filter({ hasText: c });
  await expect(request).toContainText("belle voiture");
  await shot(page, "messages-demandes-390");
  await request.getByRole("button", { name: "Accepter" }).click();
  await page.waitForURL(/\/app\/messages\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("messages")).toContainText("Bonjour, belle voiture !");
  await ctx.close();

  // Étiquette « Organisateur » : U écrit à MéditeSportCar depuis la page de la structure.
  const uCtx = await browser.newContext({ viewport: MOBILE });
  const up = await uCtx.newPage();
  await loginInBrowser(up, `${u.toLowerCase()}@e2e.orasso.test`, undefined, "/app");
  await up.goto("/o/meditesportcar");
  await up.getByTestId("contact-organizer").click();
  await up.waitForURL(/\/app\/messages\/[0-9a-f-]{36}$/);
  await up.goto("/app/messages");
  const conv = up.getByTestId("conversation-row").first();
  await expect(conv.getByTestId("conversation-tag")).toHaveText("Organisateur");
  await expect(conv).toHaveAttribute("data-kind", "organizer");
  await shot(up, "messages-organisateur-390");
  // La recherche filtre la liste.
  await up.getByTestId("conversation-search").fill("zzz-introuvable");
  await expect(up.getByText("Aucune conversation ne correspond.")).toBeVisible();
  await uCtx.close();
});

test("la Boîte et le Journal redirigent (302) vers l'Activité et les Messages", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");
  const id = "123e4567-e89b-42d3-a456-426614174000";
  for (const [from, to] of [
    ["/app/boite", "/app/messages"],
    ["/app/boite/demandes", "/app/activite/demandes"],
    [`/app/boite/${id}`, `/app/messages/${id}`],
    ["/app/journal", "/app/activite"],
  ] as const) {
    const res = await page.request.get(from, { maxRedirects: 0 });
    expect(res.status(), from).toBe(302);
    expect(new URL(res.headers().location ?? "", "http://x").pathname, from).toBe(to);
  }
  await page.goto("/app/boite");
  await expect(page.getByRole("heading", { name: "Messages", exact: true })).toBeVisible();
  await ctx.close();
});

test("l'Activité à 1 280 px : une colonne lisible, Béton et Sable", async ({ browser }) => {
  for (const theme of ["beton", "sable"] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await setTheme(page, theme);
    await loginInBrowser(page, "damien@orasso.local", undefined, "/app/activite");
    await expect(page.getByRole("heading", { name: "Activité", exact: true })).toBeVisible();
    await shot(page, `activite-${theme}-1280`);
    await page.goto("/app/messages");
    await expect(page.getByRole("heading", { name: "Messages", exact: true })).toBeVisible();
    await shot(page, `messages-${theme}-1280`);
    await ctx.close();
  }
});
