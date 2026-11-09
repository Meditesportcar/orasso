import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD } from "./helpers";
import { cars, cleanVotes, createHandVote, draftEvent, dropDraft, lydia, lydiaStaff, manage } from "./helpers/lotr7l2";
import { RELAIS } from "./relais";

// Lot R7l2, appli : les votes à thème côté organisateur et staff.
//  - l'éditeur à neuf étapes : « Votes du public » après « Règlement » ; « Toutes catégories » d'office, retiré puis remis
//    par « Ajouter » avec son modèle ; un vote à la main (jamais « au premier pointage ») ; un vote jamais lancé sur un
//    brouillon ;
//  - l'écran « Votes » : état de chaque vote, « Lancer le vote » inactif et expliqué sans deux candidats entrés, candidats
//    par la recherche et par le scan du QR (refus « Pas encore entrée : scanne-la à l'entrée d'abord »), Lancer et Clore avec
//    confirmation ;
//  - le mode staff : la liste en lecture, sans Lancer, Clore ni scan, et l'API refuse ses écritures.
// APP_URL = l'appli compilée ; API et seed lancés ; événement en cours « Rassemblement du Lydia ».
const APP = process.env.APP_URL;
const DIR = (process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7l2-captures/apres/recette-appli`).replaceAll("\\", "/");
const TITLE = "Recette R7l2 appli";
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000, locale: "fr-FR", timezoneId: "Europe/Paris" });
test.setTimeout(420_000);

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string, casquette: RegExp | null, width = 390, height = 860) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    baseURL: APP,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  });
  await ctx.addInitScript(() => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", "sable");
  });
  const page = await ctx.newPage();
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties|profil|direct/, { timeout: 60_000 });
  if (casquette) {
    await page.goto("/moi");
    await afterOpening(page);
    await page.getByTestId("casquette-organizer").filter({ hasText: casquette }).first().click();
    await page.waitForURL(/\/direct/, { timeout: 60_000 });
  }
  return { ctx, page };
}

async function go(page: Page, path: string, waitFor: string) {
  await page.goto(path);
  await afterOpening(page).catch(() => undefined);
  await expect(page.getByTestId(waitFor).first()).toBeVisible({ timeout: 45_000 });
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

test("éditeur : étape Votes, Toutes catégories retiré puis remis, vote à la main, brouillon sans Lancer", async ({
  browser,
}) => {
  const draft = await draftEvent(`${TITLE} éditeur ${Date.now().toString(36)}`);
  const { ctx, page } = await open(browser, "damien@orasso.local", /M.ditesportcar/i);
  try {
    await go(page, `/evenement/${draft.id}/modifier?temps=votes`, "wizard-votes");
    // Neuf étapes : « Votes » entre « Règlement » et « Affiche ».
    await expect(page.getByTestId("wizard-title-head")).toHaveText(/Votes du public/i);
    await expect(page.getByLabel(/Étape 7 sur 9/).first()).toBeVisible();
    await expect(page.getByTestId("wizard-votes-count")).toHaveText("1 vote prévu");
    const start = await manage(draft.id, "damien@orasso.local");
    const all = start.items.find((v) => v.kind === "all_categories");
    expect(all?.rareStamp).toBe(true);
    await expect(page.getByTestId(`wizard-vote-${all?.id}`)).toContainText("Toutes catégories");
    await shot(page, "etape-votes-liste");

    // Retiré (aucune voix), puis remis par « Ajouter » : le modèle « Toutes catégories » est en tête des modèles.
    await page.getByTestId(`wizard-vote-menu-${all?.id}`).click();
    await page.getByTestId(`wizard-vote-remove-${all?.id}`).click();
    await page.getByTestId("wizard-vote-remove-yes").click();
    await expect(page.getByTestId("wizard-votes-count")).toHaveText("Aucun vote prévu");
    await page.getByTestId("wizard-vote-add").click();
    await expect(page.getByTestId("vote-form-title")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("vote-templates").getByRole("button", { name: "Toutes catégories" }).click();
    await page.getByTestId("vote-form-submit").click();
    await expect(page.getByTestId("wizard-votes-count")).toHaveText("1 vote prévu", { timeout: 30_000 });
    const back = await manage(draft.id, "damien@orasso.local");
    expect(back.items.map((v) => v.id)).toEqual([all?.id]);

    // Un vote à la main : « Concours de rupteur », jamais « Dès les premières entrées ».
    await page.getByTestId("wizard-vote-add").click();
    await expect(page.getByTestId("vote-form-title")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("vote-templates").getByRole("button", { name: "Concours de rupteur" }).click();
    await expect(page.getByTestId("vote-open-mode-first_entry")).toHaveCount(0);
    await expect(page.getByTestId("vote-open-mode-manual")).toBeVisible();
    await shot(page, "vote-form-a-la-main");
    await page.getByTestId("vote-form-duration").getByRole("button", { name: "30 min" }).click();
    await page.getByTestId("vote-form-submit").click();
    await expect(page.getByTestId("wizard-votes-count")).toHaveText("2 votes prévus", { timeout: 30_000 });
    const two = await manage(draft.id, "damien@orasso.local");
    const hand = two.items.find((v) => v.title === "Concours de rupteur");
    expect(hand).toMatchObject({ openMode: "manual", durationMinutes: 30, kind: "theme" });

    // Un titre vide ne s'enregistre pas et dit pourquoi.
    await page.getByTestId("wizard-vote-add").click();
    await expect(page.getByTestId("vote-form-problem")).toContainText("titre", { timeout: 30_000 });
    await expect(page.getByTestId("vote-form-submit")).toBeDisabled();
    await page.getByTestId("vote-form-title").fill("Plus belle fantaisie");
    await page.getByTestId("vote-mode-origins").click();
    await expect(page.getByTestId("vote-form-problem")).toContainText("origine");
    await shot(page, "vote-form-origine-sans-choix");

    // Un brouillon ne lance pas.
    const owner = await login("damien@orasso.local");
    const refused = await apiCall<{ error: { code: string } }>(
      owner,
      "POST",
      `/events/${draft.id}/votes/${hand?.id}/open`,
    );
    expect(refused.status).toBe(409);
    expect(refused.data.error.code).toBe("event_not_published");

    // Tour 2 : le même brouillon, vu depuis l'écran « Votes », n'est pas « Clos » : prévu, candidats ouverts, « Lancer »
    // inactif et expliqué (événement pas publié).
    await go(page, `/evenement/${draft.id}/votes`, "votes-screen");
    const status = page.getByTestId(`vote-status-${hand?.id}`);
    await expect(status).toContainText(/Prévu|À lancer|Prêt à lancer/);
    await expect(status).not.toContainText("Clos");
    await expect(page.getByTestId(`vote-launch-${hand?.id}`)).toBeDisabled();
    await expect(page.getByTestId(`vote-card-${hand?.id}`)).toContainText("publication");
    await shot(page, "brouillon-votes");
    await page.getByTestId(`vote-open-${hand?.id}`).click();
    await expect(page.getByTestId("vote-search")).toBeVisible({ timeout: 30_000 });
    await shot(page, "brouillon-candidats");
  } finally {
    await ctx.close();
    await dropDraft(draft.id);
  }
});

test("Votes : Lancer inactif et expliqué, candidats par recherche et par QR, Lancer, Clore ; le staff lit sans bouton", async ({
  browser,
}) => {
  const ev = await lydia();
  const title = `${TITLE} ${Date.now().toString(36)}`;
  const { entered, outside, scannable } = await cars(ev.id);
  test.skip(entered.length < 2, "Le Lydia n'a pas deux voitures entrées (lancer pnpm db:seed).");
  const voteId = await createHandVote(ev.id, title);
  const sarah = await open(browser, "sarah@orasso.local", /Roues Libres/i);
  const { page } = sarah;
  try {
    // Les liens « Votes » : fiche de l'événement et Direct.
    await go(page, `/evenement/${ev.id}`, "orga-votes");
    await go(page, "/direct", "orga-direct-votes");
    await page.getByTestId("orga-direct-votes").click();
    await expect(page.getByTestId("votes-screen")).toBeVisible({ timeout: 45_000 });

    // Sans candidat, « Lancer » dit pourquoi et reste inactif.
    const card = page.getByTestId(`vote-card-${voteId}`);
    await expect(card).toBeVisible();
    await expect(page.getByTestId(`vote-status-${voteId}`)).toContainText("À lancer");
    await expect(page.getByTestId(`vote-launch-${voteId}`)).toBeDisabled();
    await expect(card).toContainText("deux candidats entrés");
    const list = await manage(ev.id);
    const allCat = list.items.find((v) => v.kind === "all_categories");
    await expect(page.getByTestId(`vote-status-${allCat?.id}`)).toContainText(/Ouvert · \d+ voix · ferme/);
    await shot(page, "votes-liste");

    // Le détail : candidats par la recherche (une voiture pas encore entrée est marquée).
    await page.getByTestId(`vote-open-${voteId}`).click();
    await expect(page.getByTestId("vote-search")).toBeVisible({ timeout: 30_000 });
    const first = entered[0];
    if (!first) throw new Error("aucune voiture entrée");
    await page.getByTestId("vote-search").fill(first.pseudo);
    await page.getByTestId(`vote-hit-add-${first.applicationId}`).click();
    await expect(page.getByTestId(`vote-candidate-${first.applicationId}`)).toContainText("entrée");
    if (outside) {
      await page.getByTestId("vote-search").fill(outside.item.pseudo);
      await page.getByTestId(`vote-hit-add-${outside.item.applicationId}`).click();
      await expect(page.getByTestId(`vote-candidate-${outside.item.applicationId}`)).toContainText("pas encore entrée");
    }
    await page.getByTestId("vote-search").fill("");
    await shot(page, "vote-detail-candidats");

    // Le scan du QR : une voiture pas encore entrée est refusée, une voiture entrée est ajoutée (source `scan`).
    await page.getByTestId("vote-scan-open").click();
    await expect(page.getByTestId("vote-scan-payload")).toBeVisible();
    if (outside) {
      await page.getByTestId("vote-scan-payload").fill(outside.payload);
      await page.getByTestId("vote-scan-payload").press("Enter");
      await expect(page.getByTestId("vote-scan-refused")).toContainText(
        "Pas encore entrée : scanne-la à l'entrée d'abord",
      );
      await shot(page, "vote-scan-refuse");
    }
    // Tour 3 : le deuxième scan est obligatoire (deux voitures entrées au QR lisible), jamais sauté en silence.
    const [scan, second] = scannable;
    expect(
      scannable.length,
      "Il faut deux voitures entrées au QR lisible : relancer pnpm db:seed",
    ).toBeGreaterThanOrEqual(2);
    if (!scan || !second) throw new Error("deux voitures scannables attendues");
    await page.getByTestId("vote-scan-payload").fill(scan.payload);
    await page.getByTestId("vote-scan-payload").press("Enter");
    await expect(page.getByTestId("vote-scan-ok")).toContainText("ajoutée");
    await shot(page, "vote-scan-ajoute");
    const sources = (await manage(ev.id)).items.find((v) => v.id === voteId)?.handCandidates ?? [];
    expect(sources.find((c) => c.applicationId === scan.item.applicationId)?.source).toBe("scan");
    expect(sources.find((c) => c.applicationId === first.applicationId)?.source).toBe("hand");
    // Un deuxième scan annonce SA voiture (pas la première scannée), un doublon dit « déjà candidate ».
    await page.getByTestId("vote-scan-payload").fill(second.payload);
    await page.getByTestId("vote-scan-payload").press("Enter");
    await expect(page.getByTestId("vote-scan-ok")).toContainText(second.item.vehicleLabel ?? "");
    await expect(page.getByTestId("vote-scan-ok")).toContainText("ajoutée");
    await page.getByTestId("vote-scan-payload").fill(scan.payload);
    await page.getByTestId("vote-scan-payload").press("Enter");
    await expect(page.getByTestId("vote-scan-ok")).toContainText("déjà candidate");
    await shot(page, "vote-scan-doublon");
    await page.getByTestId("vote-scan-done").click();

    // Le staff (Damien) : la liste sans Lancer, sans Clore, sans scan ; l'API lui refuse les écritures.
    const staffEmail = await lydiaStaff(ev.structure.id);
    const staff = await open(browser, staffEmail, null);
    const staffPage = staff.page;
    await staffPage.goto(`/staff/${ev.id}`);
    await afterOpening(staffPage).catch(() => undefined);
    await staffPage.getByRole("button", { name: "Synchroniser la liste" }).click();
    await expect(staffPage.getByTestId("staff-tile-votes")).toBeVisible({ timeout: 45_000 });
    await staffPage.getByTestId("staff-tile-votes").click();
    await expect(staffPage.getByTestId("votes-screen")).toBeVisible({ timeout: 45_000 });
    await expect(staffPage.getByTestId(`vote-card-${voteId}`)).toBeVisible();
    await expect(staffPage.locator("[data-testid^=vote-launch-]")).toHaveCount(0);
    await expect(staffPage.locator("[data-testid^=vote-close-]")).toHaveCount(0);
    await expect(staffPage.getByTestId("votes-add")).toHaveCount(0);
    await expect(staffPage.getByTestId("vote-scan-open")).toHaveCount(0);
    await shot(staffPage, "staff-votes-lecture");
    await staff.ctx.close();
    const staffCookie = await login(staffEmail);
    for (const [method, path] of [
      ["POST", `/events/${ev.id}/votes/${voteId}/open`],
      ["POST", `/events/${ev.id}/votes/${voteId}/close`],
      ["POST", `/events/${ev.id}/votes/${voteId}/candidates`],
    ] as const) {
      expect(
        (
          await apiCall(
            staffCookie,
            method,
            path,
            method === "POST" && path.endsWith("candidates") ? { qr: "x" } : undefined,
          )
        ).status,
      ).toBe(403);
    }

    // Lancer (avec confirmation), puis Clore.
    await go(page, `/evenement/${ev.id}/votes`, "votes-screen");
    await expect(page.getByTestId(`vote-launch-${voteId}`)).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId(`vote-launch-${voteId}`).click();
    await page.getByTestId("orga-confirm").click();
    await expect(page.getByTestId(`vote-status-${voteId}`)).toContainText(/Ouvert · 0 voix · ferme/, {
      timeout: 30_000,
    });
    await expect(page.getByTestId(`vote-launch-${voteId}`)).toHaveCount(0);
    await shot(page, "votes-liste-ouvert");
    await page.getByTestId(`vote-open-${voteId}`).click();
    await expect(page.getByTestId("vote-scan-open")).toHaveCount(0);
    await shot(page, "vote-detail-ouvert");
    await page.goBack();
    await page.getByTestId(`vote-close-${voteId}`).click();
    await page.getByTestId("orga-confirm").click();
    await expect(page.getByTestId(`vote-status-${voteId}`)).toContainText("Clos · 0 voix", { timeout: 30_000 });
  } finally {
    await sarah.ctx.close();
    await cleanVotes(ev.id, TITLE);
  }
});
