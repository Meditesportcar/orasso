import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { addVehicleApi, apiCall, createEvent, login, randomPlate, SEED_PASSWORD, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Crews (lot 19) dans l'appli en version web de recette (`expo start --web` derrière
// `apps/mobile/scripts/web-isolated.mjs`) : fiche du crew (chef), Explorer « Personnes et crews », en-tête du Garage,
// inscription en crew depuis la page de l'événement, confirmation de venue dans Accès (feuille avec le règlement),
// Boîte > Demandes (venue à confirmer, demande reçue par le chef). Deux thèmes à 390 px.
// Lancer avec APP_URL=http://localhost:<relais> (CORS_ORIGINS de l'API = même origine).
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-19-captures/appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");

async function shot(page: Page, name: string) {
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function appLogin(browser: Browser, pseudo: string, theme: string) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  await page.goto("/auth");
  await page.getByLabel("E-mail").fill(`${pseudo.toLowerCase()}@e2e.orasso.test`);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 30_000 });
  return { ctx, page };
}

test("appli : crew, inscription en crew, confirmation de venue, Boîte, Explorer, Garage", async ({ browser }) => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  const organizer = await login("damien@orasso.local");
  const errors: string[] = [];

  for (const theme of ["sable", "beton"] as const) {
    const s = unique();
    const kenji = `AppKenji_${s}`;
    const lea = `AppLea_${s}`;
    const paul = `AppPaul_${s}`;
    const kCookie = await signUpApi(kenji);
    const lCookie = await signUpApi(lea);
    const pCookie = await signUpApi(paul);
    for (const c of [kCookie, lCookie]) await addVehicleApi(c, randomPlate());
    const event = await createEvent(organizer, { title: `Crew appli ${s}` });
    const created = await apiCall<{ id: string; slug: string }>(kCookie, "POST", "/crews", {
      name: `Roussillon ${s}`,
      description: "Japonaises et sorties du dimanche.",
      department: "66",
    });
    expect(created.status).toBe(201);
    const crew = created.data;
    await apiCall(lCookie, "POST", `/crews/${crew.id}/requests`, { message: null });
    expect(
      (
        await apiCall(
          kCookie,
          "POST",
          `/crews/${crew.id}/requests/${encodeURIComponent((await apiCall<{ user: { id: string } }>(lCookie, "GET", "/me")).data.user.id)}/accept`,
        )
      ).status,
    ).toBe(204);
    await apiCall(pCookie, "POST", `/crews/${crew.id}/requests`, { message: "Je roule en S13." });

    // Kenji (chef) : fiche, Explorer, Garage, Boîte > Demandes, puis inscription en crew depuis l'événement.
    const k = await appLogin(browser, kenji, theme);
    k.page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text().slice(0, 200));
    });
    await k.page.goto(`/crew/${crew.slug}`);
    await expect(k.page.getByTestId("crew-pending-request")).toBeVisible({ timeout: 30_000 });
    await expect(k.page.getByTestId("crew-member")).toHaveCount(2);
    await shot(k.page, `01-crew-chef-${theme}`);
    await k.page.goto("/explorer");
    await k.page.getByText("Personnes et crews").click();
    await k.page.getByTestId("people-q").fill(`Roussillon ${s}`);
    await expect(k.page.getByTestId("crew-row").first()).toBeVisible({ timeout: 20_000 });
    await shot(k.page, `02-explorer-crews-${theme}`);
    await k.page.goto("/garage");
    await expect(k.page.getByTestId("garage-crews")).toBeVisible();
    await shot(k.page, `03-garage-${theme}`);
    await k.page.goto("/accueil");
    await k.page.getByRole("button", { name: "Boîte", exact: true }).first().click();
    await k.page.getByLabel("Demandes").click();
    await expect(k.page.getByTestId("request-crew-request")).toBeVisible({ timeout: 20_000 });
    await shot(k.page, `04-demandes-chef-${theme}`);

    await k.page.goto(`/e/${event.slug}`);
    await k.page.getByTestId("register-crew").click();
    await k.page.waitForURL(/crew\/inscription/);
    await expect(k.page.getByTestId("crew-pick")).toHaveCount(2, { timeout: 20_000 });
    for (const pick of await k.page.getByTestId("crew-pick").all()) await pick.getByRole("checkbox").click();
    await k.page.getByRole("checkbox", { name: /pour ma propre candidature/ }).click();
    await expect(k.page.getByTestId("crew-registration-recap")).toContainText(lea);
    await shot(k.page, `05-inscription-crew-${theme}`);
    await k.page.getByTestId("crew-registration-send").click();
    await expect(k.page.getByTestId("crew-registration-member")).toHaveCount(2, { timeout: 20_000 });
    await shot(k.page, `06-inscription-envoyee-${theme}`);
    await k.ctx.close();

    // Léa : Boîte > Demandes (venue à confirmer), puis Accès → feuille de confirmation.
    const l = await appLogin(browser, lea, theme);
    l.page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text().slice(0, 200));
    });
    await l.page.goto("/accueil");
    await l.page.getByRole("button", { name: "Boîte", exact: true }).first().click();
    await l.page.getByLabel("Demandes").click();
    await expect(l.page.getByTestId("request-crew-confirmation")).toBeVisible({ timeout: 20_000 });
    await shot(l.page, `07-demandes-venue-${theme}`);
    await l.page.goto("/acces");
    await l.page.getByTestId("crew-confirm-open").click();
    await l.page.getByRole("checkbox", { name: "J'ai lu le règlement de l'événement" }).click();
    await shot(l.page, `08-confirmer-venue-${theme}`);
    await l.page.getByTestId("crew-confirm").click();
    await expect(l.page.getByTestId("crew-confirm-open")).toHaveCount(0, { timeout: 20_000 });
    await shot(l.page, `09-acces-confirme-${theme}`);
    await l.ctx.close();
    const mine = await apiCall<{ status: string }[]>(lCookie, "GET", "/me/applications");
    expect(mine.data.map((a) => a.status)).toEqual(["pending"]);
  }
  expect(errors.filter((e) => !/favicon|DevTools|Sentry|expo-notifications|push/i.test(e))).toEqual([]);
});
