import { expect, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD } from "./helpers";

// Appli dans le navigateur (lot 25) : Damien, casquette Organisateur, ouvre « Soirée partenaires » (seed, privée) et
// passe par le bouton « Inviter » de la page événement : l'écran Inviter liste les invitations du seed ; Nina répond à
// la sienne dans Accès. Lancer avec APP_URL=http://localhost:<relais> (CORS_ORIGINS de l'API = même origine).
const APP = process.env.APP_URL;
test.skip(!APP, "Appli : lancer avec APP_URL");

async function openApp(browser: import("@playwright/test").Browser, email: string) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("orasso.onboarded", "1"));
  await page.goto("/auth");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 30_000 });
  return { ctx, page };
}

test("Inviter depuis la casquette Organisateur, réponse dans Accès", async ({ browser }) => {
  test.setTimeout(240_000);
  const damien = await login("damien@orasso.local");
  const ev = await apiCall<{ id: string }>(damien, "GET", "/events/by-slug/soiree-partenaires-2026");
  expect(ev.status).toBe(200);

  const { ctx, page } = await openApp(browser, "damien@orasso.local");
  await page.getByRole("button", { name: "Moi et mes casquettes" }).click();
  await page.getByTestId("casquette-organizer").filter({ hasText: "MéditeSportCar" }).click();
  await page.waitForURL(/\/direct/, { timeout: 20_000 });
  await page.goto(`/evenement/${ev.data.id}`);
  await page.getByTestId("orga-invite").click();
  await page.waitForURL(/\/inviter$/, { timeout: 20_000 });
  await expect(page.getByText("Inviter à l'événement")).toBeVisible();
  await expect(page.getByTestId("invitation-row")).toHaveCount(3);
  await ctx.close();

  // Nina : invitation en attente dans Accès, réponse par la feuille (refus pour garder le seed rejouable ailleurs).
  const nina = await openApp(browser, "nina@orasso.local");
  await nina.page.goto("/acces");
  const card = nina.page.getByTestId("received-invitation");
  await expect(card).toContainText("Soirée partenaires");
  await card.getByTestId("invitation-answer").click();
  await expect(nina.page.getByTestId("invitation-accept")).toBeVisible();
  await nina.ctx.close();
});
