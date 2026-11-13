import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD } from "./helpers";
import { RELAIS } from "./relais";

// Lot R9d, côté appli (version web de recette, `APP_URL`) : la cloche et la bulle de l'organisateur. Damien_66 en casquette
// MéditeSportCar (seed « Activité de la structure » : deux candidatures à trier sur la Nocturne, une mention, un commentaire,
// la demande de collaboration de Kenji_66, une demande de staff). Vérifie : la barre du haut (pastille, loupe, cloche « N »,
// bulle), la cloche → « Activité » (chips, « Demandes · N », « À trier » → le Tri), le « vu » (pastille à zéro), « Messages »
// (chips, « Nouveau message » → message groupé), l'ancienne adresse de la Boîte, la cloche personnelle sans rien de la
// structure. Captures : Béton et Sable, 384 px.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r9d-captures/apres/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

type Theme = "beton" | "sable";

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(1_000);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function openApp(browser: Browser, theme: Theme) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 844 }, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((th) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", th);
  }, theme);
  await page.goto("/auth");
  await page.getByLabel("E-mail").fill("damien@orasso.local");
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 30_000 });
  return { ctx, page };
}

async function chooseOrganizer(page: Page) {
  await page.goto("/moi");
  await page.getByTestId("casquette-organizer").filter({ hasText: "MéditeSportCar" }).click();
  await page.waitForURL(/\/direct/, { timeout: 20_000 });
}

type Summary = { activityUnseen?: number; staffRequests: number; coauthorRequests?: number };

for (const theme of ["beton", "sable"] as const) {
  test(`la cloche et la bulle de l'organisateur (${theme})`, async ({ browser }) => {
    test.setTimeout(300_000);
    const damien = await login("damien@orasso.local");
    const me = await apiCall<{ personas: { kind: string; id: string; label: string }[] }>(damien, "GET", "/me");
    const structure = me.data.personas.find((p) => p.kind === "organizer" && p.label.includes("MéditeSportCar"));
    const { ctx, page } = await openApp(browser, theme);
    await chooseOrganizer(page);
    // La barre du haut : la cloche (Activité) et la bulle (Messages), plus de Boîte.
    await expect(page.getByRole("button", { name: /^Activité/ }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /^Messages/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Boîte", exact: true })).toHaveCount(0);
    await shot(page, `barre-${theme}-384`);

    // La cloche → « Activité · MéditeSportCar ».
    await page
      .getByRole("button", { name: /^Activité/ })
      .first()
      .click();
    await page.waitForURL(/\/activite\/orga/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Activité", exact: true }).first()).toBeVisible();
    for (const chip of ["Tout", "À trier", "Mentions", "Commentaires", "Collaborations"]) {
      await expect(page.getByRole("tab", { name: chip, exact: true })).toBeVisible();
    }
    await expect(page.getByTestId("sact-requests-row")).toContainText(/Demandes · \d+/, { timeout: 30_000 });
    await expect(page.getByText(/candidatures? à trier/).first()).toBeVisible();
    await shot(page, `activite-${theme}-384`);

    // Le chip « Collaborations » : la demande de Kenji_66 s'ouvre sur ses boutons de réponse.
    await page.getByRole("tab", { name: "Collaborations", exact: true }).click();
    await page.getByTestId("sact-requests-row").click();
    await expect(page.getByTestId("structure-requests")).toBeVisible();
    await shot(page, `activite-collaborations-${theme}-384`);
    await page.getByRole("tab", { name: "Tout", exact: true }).click();

    // « À trier » → le Tri de l'événement.
    await page
      .getByText(/candidatures? à trier/)
      .first()
      .click();
    await page.waitForURL(/\/tri/, { timeout: 30_000 });
    await page.goBack();

    // Le « vu » : la pastille de la cloche ne compte plus que les demandes.
    await expect
      .poll(
        async () =>
          (await apiCall<Summary>(damien, "GET", `/structures/${structure?.id}/inbox/summary`)).data.activityUnseen,
        {
          timeout: 20_000,
        },
      )
      .toBe(0);

    // La bulle → « Messages » : chips, « Nouveau message » → message groupé.
    await page.goto("/messages/orga");
    await expect(page.getByRole("heading", { name: "Messages", exact: true }).first()).toBeVisible({ timeout: 30_000 });
    for (const chip of ["Tout", "Participants", "Équipe"]) {
      await expect(page.getByRole("tab", { name: new RegExp(`^${chip}`) })).toBeVisible();
    }
    await shot(page, `messages-${theme}-384`);
    await page.getByTestId("orga-new-message").click();
    await expect(page.getByTestId("new-message-group")).toContainText("Message groupé");
    await expect(page.getByTestId("new-message-staff")).toContainText("Discussion de staff");
    await shot(page, `nouveau-message-${theme}-384`);
    await page.getByTestId("new-message-group").click();
    await expect(page.getByTestId("orga-group-send")).toBeVisible({ timeout: 20_000 });
    await shot(page, `message-groupe-${theme}-384`);
    // Le message groupé part : sa ligne « Message groupé · … » ouvre en tête de la liste, le texte entier se lit en la touchant.
    const pick = async (label: string, option: RegExp) => {
      await page.getByRole("combobox", { name: label }).click();
      await page.getByRole("menuitem", { name: option }).first().click();
    };
    await pick("Événement", /Salon Argelès/);
    await pick("Destinataires", /Retenus/);
    const text = `Rendez-vous à l'entrée B ${Date.now()}`;
    await page.getByTestId("orga-group-body").fill(text);
    await expect(page.getByTestId("orga-group-preview")).toContainText(/destinataire/, { timeout: 20_000 });
    await page.getByTestId("orga-group-send").click();
    await expect(page.getByTestId("orga-group-row").first()).toContainText(text, { timeout: 30_000 });
    await expect(page.getByTestId("orga-group-row").first()).toContainText("Message groupé · ");
    await shot(page, `messages-apres-envoi-${theme}-384`);

    // L'ancienne adresse de la Boîte renvoie vers « Messages ».
    await page.goto("/boite/orga");
    await page.waitForURL(/\/messages\/orga/, { timeout: 30_000 });

    // La cloche personnelle (casquette de base) ne montre rien de la structure.
    await page.goto("/activite");
    await expect(page.getByRole("heading", { name: "Activité", exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/candidatures? à trier/)).toHaveCount(0);
    await ctx.close();
  });
}
