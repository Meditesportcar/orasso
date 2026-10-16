import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD } from "./helpers";

// Appli dans le navigateur (lot 20) : fil de l'événement sur la page événement, bouton « Discussion » du mode staff
// (conversation du staff de l'événement, en Sable). Lancer avec APP_URL=http://localhost:<relais> (Metro derrière
// apps/mobile/scripts/web-isolated.mjs, EXPO_PUBLIC_API_URL et CORS_ORIGINS posés).
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/DELL/.claude/relais/orasso/lot-20-captures/appli";
test.skip(!APP, "Appli : lancer avec APP_URL");

test("appli : fil de l'événement et discussion du staff", async ({ browser }) => {
  test.setTimeout(240_000);
  mkdirSync(DIR, { recursive: true });
  const julie = await login("julie@orasso.local");
  const staffEvents = await apiCall<{ event: { id: string; title: string } }[]>(julie, "GET", "/me/staff-events");
  const salon = staffEvents.data.find((s) => s.event.title.includes("Salon"))?.event;
  expect(salon).toBeTruthy();

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", "sable");
  });
  await page.goto("/auth");
  await page.getByLabel("E-mail").fill("julie@orasso.local");
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 30_000 });

  // Page événement : le fil montre l'annonce épinglée du seed.
  await page.goto("/e/nocturne-de-canet-2026");
  await expect(page.getByTestId("event-feed")).toContainText("Musique coupée à 22 h", { timeout: 30_000 });
  await page.getByTestId("event-feed").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${DIR}/01-fil-evenement-sable.png` });

  // Mode staff : « Discussion » à côté de l'Alerte → conversation du staff de l'événement.
  await page.goto(`/staff/${salon?.id}`);
  await page.getByTestId("staff-discussion").click();
  await page.waitForURL(/\/discussion$/);
  const text = `Parking B plein ${Date.now()}`;
  await page.getByRole("textbox", { name: "Écrire un message…" }).fill(text);
  await page.getByTestId("message-send").click();
  await expect(page.getByTestId("messages")).toContainText(text, { timeout: 20_000 });
  await page.screenshot({ path: `${DIR}/02-discussion-staff-sable.png` });
  await ctx.close();
});
