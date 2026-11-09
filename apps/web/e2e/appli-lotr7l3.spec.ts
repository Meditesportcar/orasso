import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD } from "./helpers";
import { castBy, closeVote, openedHandVote, voteSeenBy } from "./helpers/lotr7l3";
import { RELAIS } from "./relais";

// Lot R7l3, appli : voter (la liste des votes, la grille d'un concours, le classement après la voix, le trophée).
//  - la liste des votes du Lydia : une ligne par vote, le concours lancé en « Voter », « Voté » après la voix ;
//  - un vote : la grille (sa voiture grisée « C'est toi », une retenue pas encore entrée grisée), le classement **absent** avant la
//    voix (l'API ne le sert pas : `ranking` nul), **présent** après, une voix modifiable ;
//  - qui n'est pas entré ne peut pas voter (message, pas de bouton, l'API refuse) ; à la clôture le classement est visible pour une
//    personne qui n'a pas voté ;
//  - la clôture d'un vote d'une minute arrive sans recharger l'écran ;
//  - le trophée de Kenji (Béziers Night) sur la carte du garage et sur la fiche du véhicule, sans plaque lisible.
// APP_URL = l'appli compilée ; API et seed lancés ; événement en cours « Rassemblement du Lydia ».
const APP = process.env.APP_URL;
const DIR = (process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7l3-captures/apres/recette-appli`).replaceAll("\\", "/");
const STAMP = Date.now().toString(36);
// Thème des captures : R7L3_THEME=beton|sable (Sable par défaut).
const THEME = (process.env.R7L3_THEME ?? "sable") as "beton" | "sable";
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000, locale: "fr-FR", timezoneId: "Europe/Paris" });
test.setTimeout(420_000);

const PLATE = /\b[A-Z]{2}[- ]?\d{3}[- ]?[A-Z]{2}\b/;

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string, theme: "beton" | "sable" = THEME, width = 390) {
  const ctx = await browser.newContext({
    viewport: { width, height: 860 },
    baseURL: APP,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  });
  await ctx.addInitScript((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  const page = await ctx.newPage();
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties|profil|direct/, { timeout: 60_000 });
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
  await page.screenshot({ path: `${DIR}/${name}-${THEME}.png`, fullPage: true });
}

test("la liste, le vote dans le concours, le classement absent avant la voix et présent après", async ({ browser }) => {
  const v = await openedHandVote(`Recette R7l3 concours ${STAMP}`);
  // Avant la voix, l'API ne sert aucun classement à Damien (entré, pas encore voté).
  const before = await voteSeenBy("kenji@orasso.local", v.eventId, v.voteId);
  expect(before.state).toBe("open");
  expect(before.canVote).toBe(true);
  expect(before.ranking).toBeNull();
  expect(before.rankingHiddenReason).toBe("vote_first");
  // Une voix déjà donnée par un autre compte ne change rien pour Damien : le classement reste caché.
  const other = v.entered.find((c) => !c.own);
  expect(other).toBeTruthy();

  const { ctx, page } = await open(browser, "kenji@orasso.local");
  try {
    // La liste : les votes du Lydia, le concours de la recette à voter.
    await go(page, `/votes/${v.eventId}`, "votes-list");
    await expect(page.getByTestId(`votes-row-${v.voteId}`)).toBeVisible();
    await expect(page.getByTestId(`votes-chip-${v.voteId}`)).toHaveText(/Voter/i);
    await expect(page.getByTestId(`votes-title-${v.voteId}`)).toHaveText(`Recette R7l3 concours ${STAMP}`);
    expect(await page.getByTestId("votes-list").innerText()).not.toMatch(PLATE);
    await shot(page, "liste");

    // Un vote : la grille, sa voiture grisée, la retenue pas encore entrée grisée, pas de classement.
    await page.getByTestId(`votes-open-${v.voteId}`).click();
    await expect(page.getByTestId("vote-grid")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("vote-card-own")).toHaveCount(1);
    if (v.waiting) await expect(page.getByTestId("vote-card-waiting")).toHaveCount(1);
    await expect(page.getByTestId("vote-ranking-hidden")).toHaveText(/après ton vote/i);
    await expect(page.getByTestId("vote-board")).toHaveCount(0);
    // Une carte « pas encore entrée » ne se touche pas : aucune voix possible depuis l'écran.
    if (v.waiting) await expect(page.getByTestId("vote-card-waiting")).toBeDisabled();
    await shot(page, "vote-avant");

    // Toucher une voiture, puis « Voter pour … » : la voix est enregistrée et le classement apparaît.
    await page.getByTestId("vote-card").first().click();
    await expect(page.getByTestId("vote-cta")).toBeEnabled();
    await page.getByTestId("vote-cta").click();
    await expect(page.getByTestId("vote-saved")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("vote-board")).toBeVisible();
    expect(await page.getByTestId("vote-board-row").count()).toBeGreaterThan(0);
    await expect(page.getByTestId("vote-ranking-hidden")).toHaveCount(0);
    expect(await page.getByTestId("vote-board").innerText()).not.toMatch(PLATE);
    const after = await voteSeenBy("kenji@orasso.local", v.eventId, v.voteId);
    expect(after.myVote).toBeTruthy();
    expect(after.ranking).not.toBeNull();
    await shot(page, "vote-apres");

    // Une voix modifiable : « Changer mon vote » rouvre la grille (le classement se cache pendant le choix), puis une autre voiture.
    await page.getByTestId("vote-change").click();
    await expect(page.getByTestId("vote-grid")).toBeVisible();
    await expect(page.getByTestId("vote-board")).toHaveCount(0);
    const first = after.myVote;
    // La dernière carte de la grille (la première a reçu la première voix).
    await page.getByTestId("vote-card").last().click();
    await page.getByTestId("vote-cta").click();
    await expect(page.getByTestId("vote-saved")).toBeVisible({ timeout: 30_000 });
    const changed = await voteSeenBy("kenji@orasso.local", v.eventId, v.voteId);
    expect(changed.myVote).toBeTruthy();
    expect(changed.myVote).not.toBe(first);

    // Retour à la liste : la ligne dit « Voté ».
    await go(page, `/votes/${v.eventId}`, "votes-list");
    await expect(page.getByTestId(`votes-chip-${v.voteId}`)).toHaveText(/Voté/i);
    await shot(page, "liste-apres-vote");
  } finally {
    await ctx.close();
    await closeVote(v.eventId, v.voteId).catch(() => undefined);
  }
});

test("qui n'est pas entré ne peut pas voter ; à la clôture, le classement est visible pour qui n'a pas voté", async ({
  browser,
}) => {
  const v = await openedHandVote(`Recette R7l3 clôture ${STAMP}`);
  // Un compte du seed qui n'a pas de voiture entrée au Lydia (visiteur).
  const visitor = "paul.photo@orasso.local";
  const seen = await voteSeenBy(visitor, v.eventId, v.voteId);
  expect(seen.canVote).toBe(false);
  expect(seen.ranking).toBeNull();
  const cookie = await login(visitor);
  const refused = await apiCall(cookie, "PUT", `/events/${v.eventId}/votes/${v.voteId}/vote`, {
    applicationId: v.entered.find((c) => !c.own)?.applicationId,
  });
  expect([403, 409]).toContain(refused.status);

  const { ctx, page } = await open(browser, visitor);
  try {
    await go(page, `/vote/${v.eventId}?vote=${v.voteId}`, "vote-grid");
    await expect(page.getByTestId("vote-blocked")).toHaveText(/Valide ta présence|Entre sur l'événement/);
    await expect(page.getByTestId("vote-cta")).toHaveCount(0);
    await expect(page.getByTestId("vote-ranking-hidden")).toHaveText(/à la clôture/i);
    await expect(page.getByTestId("vote-board")).toHaveCount(0);
    await shot(page, "vote-visiteur");
    // Des voix, puis la clôture : le classement est servi à tous, même à qui n'a pas voté.
    for (const voter of ["damien@orasso.local", "kenji@orasso.local", "lea@orasso.local"]) {
      const target = v.entered.find((c) => !c.own && !c.pseudo.toLowerCase().startsWith(voter.split("@")[0] ?? ""));
      if (target) await castBy(voter, v.eventId, v.voteId, target.applicationId);
    }
    await closeVote(v.eventId, v.voteId);
    const closed = await voteSeenBy(visitor, v.eventId, v.voteId);
    expect(closed.state).toBe("closed");
    expect(closed.ranking).not.toBeNull();
    await page.reload();
    await afterOpening(page).catch(() => undefined);
    await expect(page.getByTestId("vote-board")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId("vote-ranking-hidden")).toHaveCount(0);
    await shot(page, "vote-clos");
    // La liste montre « Clos · voir le classement ».
    await go(page, `/votes/${v.eventId}`, "votes-list");
    await expect(page.getByTestId(`votes-detail-${v.voteId}`)).toHaveText(/Clos/);
  } finally {
    await ctx.close();
  }
});

test("la clôture d'un vote d'une minute arrive sur l'écran sans recharger", async ({ browser }) => {
  test.setTimeout(240_000);
  const v = await openedHandVote(`Recette R7l3 minute ${STAMP}`, 1);
  const { ctx, page } = await open(browser, "damien@orasso.local");
  try {
    await go(page, `/vote/${v.eventId}?vote=${v.voteId}`, "vote-grid");
    await expect(page.getByTestId("vote-cta")).toBeVisible();
    // Sans geste ni rechargement : la minuterie de l'écran relit à l'échéance et l'écran passe en « clos ».
    await expect(page.getByTestId("vote-closed")).toBeVisible({ timeout: 150_000 });
    await expect(page.getByTestId("vote-cta")).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});

test("trophée de Kenji (Béziers Night) sur la carte du garage et sur la fiche du véhicule, sans plaque lisible", async ({
  browser,
}) => {
  const cookie = await login("kenji@orasso.local");
  const mine = await apiCall<{ id: string; trophies: { voteTitle: string; eventTitle: string; rank: number }[] }[]>(
    cookie,
    "GET",
    "/me/vehicles",
  );
  const supra = mine.data.find((x) => x.trophies.length > 0);
  expect(supra, "Le seed doit donner un trophée à Kenji (Béziers Night)").toBeTruthy();
  const { ctx, page } = await open(browser, "kenji@orasso.local");
  try {
    await go(page, "/garage", "vehicle-trophies");
    await expect(page.getByTestId("vehicle-trophy").first()).toContainText(supra?.trophies[0]?.voteTitle ?? "");
    await expect(page.getByTestId("vehicle-trophy").first()).toContainText("Béziers Night");
    expect(await page.getByTestId("vehicle-trophies").innerText()).not.toMatch(PLATE);
    await shot(page, "garage-trophee");
    await go(page, `/vehicule/${supra?.id}`, "vehicle-trophies");
    await expect(page.getByTestId("vehicle-trophy").first()).toContainText("Béziers Night");
    await shot(page, "vehicule-trophee");
  } finally {
    await ctx.close();
  }
});

test("la fiche de l'événement et le Jour J mènent à la liste des votes", async ({ browser }) => {
  const { ctx, page } = await open(browser, "damien@orasso.local");
  try {
    await page.goto("/e/rassemblement-du-lydia");
    await afterOpening(page).catch(() => undefined);
    const votes = page.getByRole("button", { name: /^Votes · \d+ ouverts?/ }).first();
    await expect(votes).toBeVisible({ timeout: 45_000 });
    await votes.click();
    await expect(page.getByTestId("votes-list")).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/votes\//);
  } finally {
    await ctx.close();
  }
});
